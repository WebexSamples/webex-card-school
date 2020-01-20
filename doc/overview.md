## How this App Works
A goal of this project is to help developers understand the logic used to create this bot, and potentially use this app as a reference for creating their own bots that use buttons and cards.

## Overarching Design Goals
When designing this app we wanted to decouple the content of the lessons themselves as much as possible from the application's Webex event handling logic in the hopes that the basic server code could be re-used across other applications where information is presented across a series of cards.   The design and development of the cards themselves is described in [Creating your own lessons](.doc/lessons.md)

While we did strive for simplicity and readability in the application's implementation, this project is the actual production code backing the production version of the Buttons and Cards School bot (cardSchool@webex.bot).  

As such there are certain elements in the source that are more operationally focused, such as the [use of persistent storage](./storage.md), [logging](./logging.md) and ["beta mode"](./beta-mode.md).  It is not necessary to configure any of these components in order to run a local version of the application, and unless there are specific environment variables instructing the app to do so, they will not be used.   This section of the documenation will bypass discussing them, but the readme files referenced above will provide more details on how to configure and use them if desired.

## Buttons and Cards in a nutshell
Webex Buttons and Cards functionality is best described in the [Buttons and Cards Developers Guide](https://developer.webex.com/docs/api/guides/cards).  In a nutshell, a bot must [POST requests to the Webex /messages API](https://developer.webex.com/docs/api/v1/messages/create-a-message) with a request body that contains an attachment attribute with information about the card being posted.   If the card contains a button designed with the Action.Submit adaptive card schema element, this will generate an attachmentAction event when a user in the space clicks that button on the card.  

Typically, in order to be notified of attachmentAction events, an application must register for a [webhook](https://developer.webex.com/docs/api/guides/webhooks) associated with the attachmentAction resource.   Once an attachmentAction webhook is received, the application  can [query the Webex /attachments attchments API](https://developer.webex.com/docs/api/v1/attachment-actions/get-attachment-action-details) to get the decrypted data associated with the card action.  Applications built using the [Webex javascript SDK](https://webex.github.io/webex-js-sdk), can also register to have attachmentAction events delivered via websocket.

Let's look at how this application makes this happen:

## Initialization

After performing some housekeeping to set up logging and persistent storage, our [bot's implementatation](./server.js) leverages the [webex-node-bot-framework](https://github.com/webex/webex-bot-node-framework) to abstract away some of the complexity of writing a Webex Teams application in node.js.  It is helpful to have an understanding of what the framework provides when reading the code in  [server.js](../server.js). Developers are encouraged to read the [framework documentation](https://github.com/webex/webex-bot-node-framework/blob/master/README.md).  

Our app creates an instance of the framework by instantiating it with a configuration object that includes the bot's token, read from an environment variable, and then calls `framework.start()` to kick things off.  

```javascript
// Now kick everything off
let framework = new Framework(frameworkConfig);
framework.messageFormat = 'markdown';
// ... skip persistent storage setup logic...
framework.start()
  .catch((e) => {
    logger.error(`Framework.start() failed: ${e.message}.  Exiting`);
    process.exit(-1);
  });
```


Using the [Webex javascript SDK](https://webex.github.io/webex-js-sdk), the framework registers to be notified for all messaging related events, including the  `attacmentAction` event, which is generated whenver a user presses and Action.Submit button in a card that our application has posted.   When these events occur, the framework calls handler functions that we have implemented in our application.

The framework also creates a `bot` object for each space that our bot is a part of which allows the developer to call convenience functions such as `bot.say()`, `bot.sendCard()`, and `bot.reply()` which abstract away some of the complexities for calling the Webex RESTful APIs from a node.js based application. We use this object heavily in our app.   It is also worth noting that the framework provides `bot.store()`, and `bot.recall()` methods that can be used to store application specific content for each of the bot's spaces.  When the framework is configured with a persistant data store, such as mongo or redis, this data can be used across server restarts.

While the framework is performing its initialization our application reads the card lessons in from disk.  Each lesson contains the card design json object as well as application code to handle button presses.  

```javascript
  lessons = require(`${generatedDir}/lesson-list.json`);
  numLessons = lessons.length;
  LessonHandler = require('./lesson-handlers/common-lesson-handler.js');
  for (let i = 0; i < numLessons; i++) {
    let customHandlers = null;
    let fileName = `${generatedDir}/lesson-${i}.json`;
    let cardJson = require(fileName);
    if (lessons[i].customHandlerFile) {
      let CustomHandlers = require(`./lesson-handlers/${lessons[i].customHandlerFile}`);
      customHandlers = new CustomHandlers();
    }
    cardArray.push(new LessonHandler(cardJson, logger, lessons, lessons[i], customHandlers));
  }
```

Most cards provide only basic navigation and feedback options, and share [common code](../shared-lesson-content/common-actions.json) to handle these requests.   Certain cards may have custom logic that is also loaded.   The order of the lessons and information about custom button handler logic is specified in [lesson-order.json](../lesson-content/lesson-order.json), which helps drive the lesson generation process described in more details in [Creating your own lessons](.doc/lessons.md).

Our [server](./server.js) implements a `framework.on('spawn',..)` handler which is called whenever the framework discovers our bot in a Webex Teams space.  At startup the framework typically finds all the existing spaces that the bot is already a member of.  When running, if our bot is added to a new space, this handler is also called.   Our application differentiates between these two use cases, by checking if an actorId parameter was passed to our handler.   When present, this will be the personId of the user who added our bot to a space.  When our bot is added to a new space we show the help message.  We don't send any messages when actorId is not set so as to avoid spamming users when our server is restarted.

```javascript
framework.on('spawn', async (bot, id, addedById) => {
  try {
    let addedByPerson = null;
    if (!addedById) {
      // Framework discovered an existing space with our bot, log it
      logger.info(`During startup framework spawned bot in existing room: ${bot.room.title}`);
    } else {
      logger.info(`Our bot was added to a new room: ${bot.room.title}`);
      // Get details of the user who added our bot to this space
      addedByPerson = await this.webex.people.get(addedById);
    }
  // Other setup happens here...
});
```

## Handling messages to our bot

When users send messages to our bot, the framework calls any `framework.hears('pattern',...)` handlers when the provided message matches the pattern. Patterns can be text or regular expressions.  When the framework calls our handler, it passes to us the appropriate `bot` instance for the space where the message occured, along with a `trigger` object which provides us with details about the message itself, as well as the user who sent the message.

Our app provides handlers for the following patterns:

* /help/i - we post the help message
* /start over/i  - we post the introduction lesson
* /lesson ./i - we post the requested lesson by index
*  /.*/ - a "catch all" for any unexpected messages

Note that multiple handlers can be called, so for example if the user typed 'help' our help handler and our "catch all" handler will both be called.  Our app uses a boolean called `responded` which is set to true in all of the main handlers.   If the "catch all" handler is called and no other handlers have already been called for this message, it republishes the current lesson.

```javascript
// Any good bot should process help requests
framework.hears(/help/i, (bot) => {
  responded = true;
  showHelp(bot)
    .catch((e) => logger.error(`Error displaying help in space "${bot.room.title}": ${e.message}`));
});

// Somewhat simplified README version of "catch all" handler
framework.hears(/.*/, async (bot, trigger) => {
  if (!responded) {
    // Display current lesson
    let lessonState = await bot.recall('lessonState');
      cardArray[lessonState.currentLessonIndex].renderCard(bot, trigger, lessonState);
  }
  responded = false;
});
```

To see the handlers in action, we encourage developers to run the app in their debugger, and set a breakpoint on the first line of each handler.  Then send the bot a message and use your debugger to inspect the `bot` and `trigger` objects.

## Handling Button Presses

As described in the [Buttons and Cards Developers Guide](https://developer.webex.com/docs/api/guides/cards), there are currently three types of buttons that Webex Teams supports via the `Action` element of the Adaptive Card schema:

* Action.OpenUrl -- client will open the user's browser to the configured url.
* Action.ShowCard -- client will "expand" to show a hidden sub-card
* Action.Submit -- client will generate an `attachmentAction` event.

When attachmentAction events occur for cards that our app posted, The framework calls the `framework.on('attachmentAction', ...)` handler. Like the hears() handlers, the framework passes us a `bot` and `trigger` for each button press.   The `trigger` object in this case will include a `trigger.type` of `attachmentAction` as well as the `attachmentAction` itself.

Much like a Webex Teams `messages:created` event an `attachmentAction:created` event contains information about the user who pressed the button and the space where the button was pressed.  In addition in includes an `inputs` object which captures any data associated with the card when the button was pressed.   

The `inputs` object is populated by card specific data.  Card designers can specify key/value pairs to be returned that are specific to the button that was pressed.   The `inputs` field will also provide the values associated with any Input elements in the card.  For example, users may have been asked to enter text, or select from drop down option boxes.

The buttons used in our applciation provide the following inputs:

If the "Next Lesson" button is pressed:
* `nextLesson` - set to true
* `lessonIndex` - index of the next lesson

If the "Pick a Lesson" button is pressed
* `pickaAnotherLesson` - set to true
* `jumpToLessonIndex` - index of the lsson to jump to

Using this information our handler logic can determine if the user is asking to load another card, and can call the `renderCard()` method for the appropriate card.

If the `attachementAction` was generated by a button push not associated by one of the navigation buttons, our handler will call the `handleSubmit()` method for the current card.   It discovers the current card by inspecting the `inputs` object for the `myCardIndex` attribute which is set via a hidden Input.Choice field this is returned with every button press.

```javascript
// Somewhat simplified README version of attachmentAction handler
framework.on('attachmentAction', async (bot, trigger) => {
    attachmentAction = trigger.attachmentAction;
    // Go to next card (or ask this card to handle input)
    if (attachmentAction.inputs.nextLesson) {
      cardArray[attachmentAction.inputs.lessonIndex].renderCard(bot, trigger);
    } else if (attachmentAction.inputs.pickAnotherLesson) {
      cardArray[attachmentAction.inputs.jumpToLessonIndex].renderCard(bot, trigger);
    } else {
      // Handle card specific actions
      cardArray[attachmentAction.inputs.myCardIndex].handleSubmit(trigger, bot);
    }
});
```

## A note about the use of bot.reply()
In some circumstances our bot sends a threaded reply in response to button presses.  This happens in cases where the bot determines the user is interacting with a card that is not the most recently displayed lesson, or if the lesson content dictates the use of a threaded reply.

At the time of our intial publishing, the API that supports threaded replies is not yet GA.  If you wish to use this feature in your implementation of this bot, please open an issue on this project and we can work to get you early access to this feature.   Alternately, replace the `bot.reply()` call in in the `framework.on('attachmentAction'..)` handler with a call to `bot.say()` instead.

## More Information

* [Main README for project](../README.md)
* [Running this project locally](.doc/running.md)
* [Creating your own lessons](.doc/lessons.md)
* [Using Persistent Storage](./storage.md)
* [Advanced Logging](./logging.md)
* Limiting access to your bot with ["beta mode"](./beta-mode.md) 
* [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.



