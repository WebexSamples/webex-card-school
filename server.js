/*
Cisco Webex Bot to teach users about buttons and cards

This bot is built on the webex-node-bot-framework
https://github.com/WebexSamples/webex-node-bot-framework

This framework provides many conveniences for building
a Webex Teams bot in node.js and all functions with names
like bot.* and framework.* are processed by the framework.
See the framework's readme for more details on how it works
*/

var Framework = require('webex-node-bot-framework');
var express = require('express');
var _ = require('lodash');

// When running locally read environment variables from a .env file
require('dotenv').config();
logger = require('./logger');

// Print out the docker container build date if available
if (process.env.DOCKER_BUILD) {
  logger.info('\n\n\nSERVICE RESTARTING...\n\n\n');
  logger.info(`Starting app in docker container built: ${process.env.DOCKER_BUILD}`);
}

// The admin user or 'admin space' gets extra notifications about bot 
// usage and feedback. If both are set we prefer the space
let adminEmail = '';
let adminSpaceId = '';
let adminsBot = null;
let botEmail = 'the bot';
if (process.env.METRICS_ROOM_ID) {
  adminSpaceId = process.env.METRICS_ROOM_ID;
} else if (process.env.ADMIN_EMAIL) {
  adminEmail = process.env.ADMIN_EMAIL;
} else {
  logger.warn('No METRICS_ROOM_ID or ADMIN_EMAIL environment variable. \n' +
    'Will not notify anyone about bot activity');
}


// Configure the bot framework for the environment we are running in
var frameworkConfig = {};
if ((process.env.TOKEN) && (process.env.PORT)) {
  frameworkConfig.token = process.env.TOKEN;
  // Adaptive Card with images can take a long time to render
  // Extend the timeout when waiting for a webex API request to return
  frameworkConfig.requestTimeout = 60000;
} else {
  logger.error('Cannot start server.  Missing required environment varialbles TOKEN or PORT');
  process.exit();
}

// This bot uses the framework's Mongo persistent storage driver
// Read in the configuration and get it ready to initialize
var mConfig = {};
if (process.env.MONGO_URI) {
  mConfig.mongoUri = process.env.MONGO_URI;
  if (process.env.MONGO_BOT_STORE) { mConfig.storageCollectionName = process.env.MONGO_BOT_STORE; }
  if (process.env.MONGO_BOT_METRICS) { mConfig.metricsCollectionName = process.env.MONGO_BOT_METRICS; }
  if (process.env.MONGO_SINGLE_INSTANCE_MODE) { mConfig.singleInstance = true; }
  // Setup our default persistent config storage
  // That will be assigned to any newly created bots
  frameworkConfig.initBotStorageData = {
    lessonState: {
      currentLessonIndex: 0,
      previousLessonIndex: 0,
      totalLessons: 0
    }
  };
} else {
  console.error('The mongo storage driver requires the following environment variables:\n' +
    '* MONGO_URI -- mongo connection URL see https://docs.mongodb.com/manual/reference/connection-string' +
    '\n\nThe following optional environment variables will also be used if set:\n' +
    '* MONGO_BOT_STORE -- name of collection for bot storage elements (will be created if does not exist).  Will use "webexBotFramworkStorage" if not set\n' +
    '* MONGO_BOT_METRICS -- name of a collection to write bot metrics to (will be created if does not exist). bot.writeMetric() calls will fail if not set\n' +
    '* MONGO_INIT_STORAGE -- stringified object assigned as the default startup config if non exists yet\n' +
    '* MONGO_SINGLE_INSTANCE_MODE -- Optimize lookups speeds when only a single bot server instance is running\n\n' +
    'Also note, the mongodb module v3.4 or higher must be available (this is not included in the framework\'s default dependencies)');
  logger.error('Running without having these set will mean that there will be no persistent storage \n' +
    'across server restarts, and that no metrics will be written.  Generally this is a bad thing for production, \n' +
    ' but may be expected in developement.  If you meant this, please disregard warnings about ' +
    ' failed calls to bot.recall() and bot.writeMetric()');
}

// The beta-mode module allows us to restrict our bot to spaces
// that include a specified list of users
let betaUsers = false;
let BetaMode = null;
if (process.env.BETA_USER_EMAILS) {
  betaUsers = process.env.BETA_USER_EMAILS.split(/[ ,]+/);
  if (betaUsers.length) {
    BetaMode = require('./beta-mode');
  }
}

// Wow, that was as lot of setup!
// Now kick everything off
let framework = new Framework(frameworkConfig);
framework.messageFormat = 'markdown';
logger.info("Starting framework, please wait...");
if (typeof mConfig.mongoUri === 'string') {
  // Initialize our mongo storage driver and the the bot framework.
  //let MongoStore = require('webex-node=bot-framework/storage/mongo');
  let MongoStore = require('./node_modules/webex-node-bot-framework/storage/mongo.js');
  let mongoStore = new MongoStore(mConfig);
  mongoStore.initialize()
    .then(() => framework.storageDriver(mongoStore))
    .then(() => framework.start())
    .catch((e) => {
      logger.error(`Initialization with mongo storage failed: ${e.message}`);
      process.exit(-1);
    });
} else {
  framework.start()
    .catch((e) => {
      logger.error(`Framework.start() failed: ${e.message}.  Exiting`);
      process.exit(-1);
    });
}

// While the framework initializes, read in the lesson cards we'll be using
// This data is generated via `npm run build`
let generatedDir = './generated';
let lessons;
let numLessons;
let cardArray = [];
try {
  lessons = require(`${generatedDir}/lesson-list.json`);
  numLessons = lessons.length;
  logger.info(`Reading in ${numLessons} lessons on initialization...`);

  LessonHandler = require('./lesson-handlers/common-lesson-handler.js');
  for (let i = 0; i < numLessons; i++) {
    let customHandlers = null;
    let fileName = `${generatedDir}/lesson-${i}.json`;
    logger.verbose(`${lessons[i].title} is being loaded from ${fileName}`);
    let cardJson = require(fileName);
    if (lessons[i].customHandlerFile) {
      let CustomHandlers = require(`./lesson-handlers/${lessons[i].customHandlerFile}`);
      customHandlers = new CustomHandlers();
    }
    cardArray.push(new LessonHandler(cardJson, logger, lessons, lessons[i], customHandlers));
  }
} catch (e) {
  console.error(`During initiatlization error reading in card data: ${e.message}`);
  process.exit(-1);
}

/*
 * The "setup" is now complete.   The reminder of this app logic
 * is all about responding to events coming from the framework
 *
 */

// Called after the framework has registered all necessary event handlers
// and discovered up to the number of bots specified in maxStartupSpaces
framework.on("initialized", function () {
  logger.info("Framework initialized successfully! [Press CTRL-C to quit]");
  if ((adminSpaceId) && (!adminsBot)) {
    // Our admin space was not one of the ones found during initialization
    logger.verbose('Attempting to force spawn of the bot for the Admin space');
    framework.webex.memberships.list({
      roomId: adminSpaceId,
      personId: framework.person.id
    })
      .then((memberships) => {
        if ((memberships.items) && (memberships.items.length)) {
          framework.spawn(memberships.items[0]);
        }
      })
      .catch((e) => logger.error(`Failed trying to force spawn of admin bot: ${e.message}`));
  }
});


// Called when the framework discovers a space our bot is in
// At startup, (before the framework is fully initialized), this
// is called when the framework discovers an existing spaces.
// After initialization, if our bot is added to a new space the 
// framework processes the membership:created event, creates a
// new bot object and generates this event with the addedById param
// The framework can also "lazily" discover spaces that it missed
// during startup when any kind of activity occurs there.  In these
// cases addedById will always be null
// TL;DR we use the addedById param to see if this is a new space for our bot
framework.on('spawn', async (bot, id, addedById) => {
  try {
    let addedByPerson = null;
    if (!addedById) {
      // Framework discovered an existing space with our bot, log it
      if (!framework.initialized) {
        logger.info(`During startup framework spawned bot in existing room: ${bot.room.title}`);
      } else {
        logger.info(`Bot object spawn() in existing room: "${bot.room.title}" ` +
          `where activity has occured since our server started`);
      }
    } else {
      logger.info(`Our bot was added to a new room: ${bot.room.title}`);
      // Get details of the user who added our bot to this space
      addedByPerson = await bot.webex.people.get(addedById);
    }

    // Do some housekeeping if the bot for our admin space hasn't spawned yet
    if (!adminsBot) {
      tryToInitAdminBot(bot, framework);
    }

    // If we specified EFT users, register the beta-mode module
    if (betaUsers) {
      bot.betaMode = new BetaMode(bot, logger, true, betaUsers);
      let validBetaSpace = await bot.betaMode.onSpawn(addedByPerson);
      if (!validBetaSpace) {
        if (addedById) {
          // Capture metrics for this new space, but we aren't going to operate in 
          // this space because there are no users in the beta program there
          notifyAllOfNewSpawn(bot, addedByPerson);
        }
        return;
      }
    }

    if (addedById) {
      // Our bot has just been added to a new space!  
      // Since we just got added, say hello
      showHelp(bot)
        .then(() => {
          if (!bot.isDirect) {
            // skip the card for 1-1 space, since we also will send it in 
            // response to the message the user sent in order to create the space
            cardArray[0].renderCard(bot,
              // creating a "trigger object" for metrics to use
              {
                type: "spawn",
                message: {
                  text: 'Initial Add Action',
                  personId: addedById
                },
                person: addedByPerson
              })
              .catch((e) => logger.error(`Error initial lesson in space "${bot.room.title}": ${e.message}`));
          }
        })
        .catch((e) => logger.error(`Error sending initial help in space "${bot.room.title}": ${e.message}`));

      notifyAllOfNewSpawn(bot, addedByPerson);
    }

  } catch (e) {
    logger.error(`Failed to init stored configuration and beta mode. Error:${e.message}`);
  }
});

framework.on('roomRenamed', function (bot) {
  return bot.recall('spaceTitle')
    .then((oldTitle) => {
      if (oldTitle != bot.room.title) {
        logger.info(`Bot spaceId:"${bot.room.id}" has been renamed:  "${bot.room.title}"`);
        return bot.store('spaceTitle', bot.room.title);
      } else {
        return when(true);
      }
    })
    .catch((e) => {
      logger.warn(`Failed to to update bot store with new room title: ${e.message}`);
      return when(false);
    });
});


framework.on('despawn', function (bot, id, removedById) {
  return bot.writeMetric({ 'event': 'botRemovedFromSpace' }, removedById)
    .then(() => logger.info(`Bot has been removed from space "${bot.room.title}"`))
    .catch((e) => {
      logger.warn(`Failed to write metric about bot being despawned: ${e.message}`);
      return when(false);
    });
});

/*
 * framework.hears() events will process text based messages to our bot
 *
 * Most of the "action" for this bot will happen via Button presses 
 * see framework.on('attachmentAction',..) below
 */
var responded = false;
// Any good bot should process help requests
framework.hears(/help/i, (bot) => {
  responded = true;
  showHelp(bot)
    .catch((e) => logger.error(`Error displaying help in space "${bot.room.title}": ${e.message}`));
});

// start the lessons over
framework.hears(/start over/i, (bot, trigger) => {
  responded = true;
  cardArray[0].renderCard(bot, trigger);
});

// go to a lesson
framework.hears(/lesson ./i, (bot, trigger) => {
  console.log(trigger.args);
  const args = _.toLower(trigger.text).split(' ');
  let lessonIndex = args.indexOf('lesson');
  if ((lessonIndex > -1) && (lessonIndex < args.length - 1)) {
    let lesson = parseInt(trigger.args[lessonIndex + 1]);
    if ((lesson >= 0) && (lesson < cardArray.length)) {
      cardArray[lesson].renderCard(bot, trigger);
      responded = true;
    }
  }
  if (!responded) {
    responded = true;
    bot.say(`Not sure how to respond to "${trigger.message.text}"`)
      .then(() => showHelp(bot));
  }
});

// resend the current lesson card in response to any input
framework.hears(/.*/, async (bot, trigger) => {
  if (!responded) {
    try {
      let lessonState = await bot.recall('lessonState');
      let currentLessonIndex = parseInt(lessonState.currentLessonIndex);
      if ((currentLessonIndex >= 0) && (currentLessonIndex < cardArray.length)) {
        cardArray[currentLessonIndex].renderCard(bot, trigger, lessonState);
      } else {
        logger.error(`Got invalid index for current lesson: ${currentLessonIndex}` +
          ` in response to ${trigger.text} in space "${bot.space.title}".` +
          `  Displaying intro lesson.`);
        cardArray[0].renderCard(bot, trigger);
      }
    } catch (e) {
      logger.error(`Failed bot.recall('lessonState'): ${e.message}.` +
        ` in response to ${trigger.text} in space "${bot.space.title}".` +
        `  Displaying intro lesson.`);
      cardArray[0].renderCard(bot, trigger);
    }
  }
  responded = false;
});

/*
 * framework.on('attachmentAction',..) processes events generated
 * when a user clicks on an Action.Submit button
 *
 * Note that Action.ShowCard and Action.OpenUrl are handled directly
 * in the Webex Teams client.  Our bot is not notified
 */
framework.on('attachmentAction', async (bot, trigger) => {
  let attachmentAction = null;
  try {
    attachmentAction = trigger.attachmentAction;
    logger.verbose(`Got an attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`);
    try {
      // Only process input from most recently displayed card
      let activeCardMessageId = await bot.recall('activeCardMessageId');
      if (attachmentAction.messageId !== activeCardMessageId) {
        return bot.reply(attachmentAction, 'I do not process button clicks from old lessons.' +
          ' Scroll down to the most recent lesson card, or post any message to get me to display a new lesson.');
      }
    } catch (e) {
      logger.error(`on attachmentAction handler failed bot.recall('activeCardMessageId'): ${e.message} ` +
        '\nDB State may be out of wack. Will process button click and try to recover...');
    }

    if (attachmentAction.inputs.nextLesson) {
      // Go to next lesson
      cardArray[attachmentAction.inputs.lessonIndex].renderCard(bot, trigger);
    } else if (attachmentAction.inputs.pickAnotherLesson) {
      // Jump to another lesson
      cardArray[attachmentAction.inputs.jumpToLessonIndex].renderCard(bot, trigger);
    } else {
      logger.info("Handling a non-navigation button press with the following inputs...");
      logger.info(attachmentAction.inputs);
      let index = parseInt(attachmentAction.inputs.myCardIndex);
      cardArray[index].handleSubmit(trigger, bot);
    }
  } catch (e) {
    logger.error(`Error processing AttachmentAction: ${e.message}`);
    if ((typeof attachmentAction === 'object') && (typeof attachmentAction.inputs == 'object')) {
      logger.error('inputs object from attachmentAction:');
      logger.error(attachmentAction.inputs);
    }
  }
});

/*
 * Helper functions used above
 */
async function showHelp(bot) {
  return bot.say('This bot provides Webex Teams users and developers with an ' +
    'opportunity to experience ' +
    '[Buttons and Cards](https://developer.webex.com/docs/api/guides/cards) ' +
    'and to learn more about them.\n\n' +
    'Through a series of lessons, presented using Buttons and Cards, ' +
    'users will experience working with Cards, learn about how they are created ' +
    'and gain access to more resources to take their learning further.\n\n ' +
    'Most interaction takes place via buttons and cards but I do support a few text commands:\n\n ' +
    '* **help** - will present this message again\n' +
    `* **lesson X** - show card for a lesson, X is a digit: 0 - ${cardArray.length - 1}\n` +
    '* **start over** - will bring up the first lesson\n' +
    '* any other text input will re-render the current lesson card.');
}

function notifyAllOfNewSpawn(bot, addedByPerson) {
  // Notify any admins via Webex Teams
  if (adminsBot) {
    let msg = `${bot.person.displayName} was added to a space: "${bot.room.title}"`;
    if (addedByPerson) {
      msg += ` by ${addedByPerson.displayName}`;
    }
    adminsBot.say(msg)
      .catch((e) => logger.error(`Failed to update to Admin about a new bot. Error:${e.message}`));
  }

  // Write to our metrics DB
  bot.writeMetric({ 'event': 'botAddedToSpace' }, addedByPerson)
    // Add some info to this bot's stored information
    .then(() => bot.store('spaceTitle', bot.room.title))
    .then(() => bot.store('addedDate', bot.lastActivity))
    .then(() => {
      if (addedByPerson) {
        bot.store('addedBy', addedByPerson.displayName)
          .then(() => bot.store('addedByEmail', addedByPerson.emails[0]))
          .catch((e) => logger.error(`During spawn handler, failed writing new bot details to data store: ${e.message}`));
      }
    })
    .catch((e) => logger.error(`During spawn handler, failed writing new bot details to data store: ${e.message}`));
}

function tryToInitAdminBot(bot, framework) {
  // Set our bot's email -- this is used by our health check endpoint
  if (botEmail === 'the bot') {  // should only happen once
    botEmail = bot.person.emails[0];
  }
  // See if this is the bot that belongs to our admin space
  if ((!adminsBot) && (bot.isDirect) && (adminEmail) &&
    (bot.isDirectTo.toLocaleLowerCase() === adminEmail.toLocaleLowerCase())) {
    adminsBot = bot;
    framework.adminsBot = adminsBot;
  } else if ((!adminsBot) && (adminSpaceId) && (bot.room.id === adminSpaceId)) {
    adminsBot = bot;
    framework.adminsBot = adminsBot;
  }
}


/*
 * Basic express server routes and handling
 */
var app = express();

// Serve image files used by cards
app.use(express.static('public'));

// Health Check
app.get('/', function (req, res) {
  if (process.env.DOCKER_BUILD) {
    res.send(`I'm alive, running in container built ${process.env.DOCKER_BUILD}.  To use this app add ${botEmail} to a Webex Teams space.`);
  } else {
    res.send(`I'm alive.  To use this app add ${botEmail} to a Webex Teams space.`);
  }
});

var server = app.listen(process.env.PORT, function () {
  logger.info('Server started. Listening on port %s', process.env.PORT);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', () => {
  framework.debug('stoppping...');
  server.close();
  framework.stop()
    .then(() => process.exit());
});