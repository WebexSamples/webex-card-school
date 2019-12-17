/*
Cisco Webex Bot to teach users about buttons and cards

This bot is built on the webex-node-bot-framework
https://github.com/jpjpjp/webex-node-bot-framework

This framework provides many conveniences for building
a Webex Teams bot in node.js and all functions with names
like bot.* and framework.* are processed by the framework.
See the framework's readme for more details on how it works
*/

var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var _ = require('lodash');

// When running locally read environment variables from a .env file
require('dotenv').config();
logger = require('./logger');

// Print out the docker container build date if available
if (process.env.DOCKER_BUILD) {
  logger.info('\n\n\nSERVICE RESTARTING...\n\n\n');
  logger.info(`Starting app in docker container built: ${process.env.DOCKER_BUILD}`);
}

// Configure the bot framework for the environment we are running in
var frameworkConfig = {};
if ((process.env.WEBHOOK) && (process.env.TOKEN) &&
  (process.env.PORT)) {
  frameworkConfig.webhookUrl = process.env.WEBHOOK;
  frameworkConfig.token = process.env.TOKEN;
  frameworkConfig.port = process.env.PORT;
  // Adaptive Card with images can take a long time to render
  // Extend the timeout when waiting for a webex API request to return
  frameworkConfig.requestTimeout = 60000;

} else {
  logger.error('Cannot start server.  Missing required environment varialbles WEBHOOK, TOKEN or PORT');
  process.exit();
}

// The beta-mode module allows us to restrict our bot to spaces
// that include a specified list of users
let betaUsers = [];
let BetaMode = null;
if (process.env.EFT_USER_EMAILS) {
  betaUsers = process.env.EFT_USER_EMAILS.split(/[ ,]+/);
  if (betaUsers.length) {
    BetaMode = require('./beta-mode');
  }
}


// The admin will get extra notifications about bot usage
let adminEmail = '';
let adminSpaceId = '';
let adminsBot = null;
let botEmail = 'the bot';
if (process.env.METRICS_ROOM_ID) {
  adminSpaceId = process.env.METRICS_ROOM_ID;
}
else if (process.env.ADMIN_EMAIL) {
  adminEmail = process.env.ADMIN_EMAIL;
} else {
  logger.error('No ADMIN_EMAIL environment variable.  Will not notify author about bot activity');
}
if ((process.env.BOTNAME) && (process.env.BOT_EMAIL)) {
  // TODO see what happens if this never happens
  botName = process.env.BOTNAME;
  botEmail = process.env.BOT_EMAIL;
}

// Read the tables we will write metrics data into
let metricsTables = [];
let metricsTable = '';
if (process.env.MONGO_BOT_METRICS) {
  metricsTable = process.env.MONGO_BOT_METRICS;
  metricsTables.push(metricsTable);
}

// Setup our persistent config storage
let defaultStoredConfig = {
  currentLessonIndex: 0,
  previousLessonIndex: 0
};
let MongoStore = require('./storage/mongo.js');
let mongoStore = new MongoStore(logger, defaultStoredConfig);


app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// init framework
var framework = new Framework(frameworkConfig);
// TODO, ideally we would somehow wait until DB is initialized before starting the framework
framework.mongoStore = mongoStore;
framework.start()
  .catch((e) => {
    logger.error(`Framework.start() failed: ${e.message}.  Exiting`);
    process.exit(-1);
  });
framework.messageFormat = 'markdown';
logger.info("Starting framework, please wait...");

// Read in the lesson cards we'll be using
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
    // TODO Am I going to miss spawn events by hogging the processor here?
    let customHandlers = null;
    let fileName = `${generatedDir}/lesson-${i}.json`;
    logger.verbose(`${lessons[i].title} is being loaded from ${fileName}`);
    let cardJson = require(fileName);
    if (lessons[i].customHandlerFile) {
      let CustomHandlers = require(`./lesson-handlers/${lessons[i].customHandlerFile}`);
      customHandlers = new CustomHandlers();
    }
    cardArray.push(new LessonHandler(cardJson, logger, lessons, lessons[i], metricsTables, customHandlers));
  }
} catch (e) {
  console.error(`During initiatlization error reading in card data: ${e.message}`);
  process.exit(-1);
}

framework.on("initialized", function () {
  logger.info("Framework initialized successfully! [Press CTRL-C to quit]");
});


framework.on('spawn', async function (bot, id, addedById) {
  // Save initialization status when this handler was first called
  let initiatlized = framework.initialized;
  let addedByPerson = null;
  // Notify the admin if the bot has been added to a new space
  if (!initiatlized) {
    // An instance of the bot has been added to a room
    logger.info(`Framework startup found bot in existing room: ${bot.room.title}`);
  } else {
    logger.info(`Our bot was added to a new room: ${bot.room.title}`);
  }
  // Set our bot's email -- this is used by our health check endpoint
  if (botEmail === 'the bot') {  // should only happen once
    botEmail = bot.person.emails[0];
  }

  try {
    // Ideally we fetch any existing betamode config from a database
    // before configuring it for this run of our server
    await framework.mongoStore.onSpawn(bot, initiatlized, metricsTables);
    if (addedById) {
      addedByPerson = await this.webex.people.get(addedById);
    }
    // If we specified EFT users, register the beta-mode module
    if (betaUsers) {
      bot.betaMode = new BetaMode(bot, logger, true, betaUsers);
      let validBetaSpace = await bot.betaMode.onSpawn(addedByPerson);
      if (!validBetaSpace) {
        return;
      }
    }
  } catch (e) {
    logger.error(`Failed to init stored configuration and beta mode. Error:${e.message}`);
  }
  // See if this instance is the 1-1 space with the admin
  if ((!adminsBot) && (bot.isDirect) && (adminEmail) &&
    (bot.isDirectTo.toLocaleLowerCase() === adminEmail.toLocaleLowerCase())) {
    adminsBot = bot;
    this.adminsBot = adminsBot;
  } else if ((!adminsBot) && (adminSpaceId) && (bot.room.id === adminSpaceId)) {
    adminsBot = bot;
    this.adminsBot = adminsBot;
  }

  if (initiatlized) {
    // Our bot has just been added to a new space!
    if (adminsBot) {
      let msg = `${bot.person.displayName} was added to a space: "${bot.room.title}"`;
      if (addedByPerson) {
        msg += ` by ${addedByPerson.displayName}`;
      }
      adminsBot.say(msg)
        .catch((e) => logger.error(`Failed to update to Admin about a new bot. Error:${e.message}`));
    }

    // Write to our metrics DB
    framework.mongoStore.writeMetric(metricsTable, 'botAddedToSpace', bot, addedByPerson);

    // Since we just got added, say hello
    showHelp(bot)
      .then(() => cardArray[0].renderCard(bot, { message: {text: 'Initial Add Action'}, person: addedByPerson })
        .catch((e) => logger.error(`Error starting up in space "${bot.room.title}": ${e.message}`)));
  }
});

framework.on('despawn', async function (bot, id, removedById) {
  logger.info(`Bot has been removed from space "${bot.room.title}"`);
  framework.mongoStore.writeMetric(metricsTable, 'botRemovedFromSpace', bot, removedById);
});


/*
 * framework.hears() events will process text based messages to our bot
 *
 * Most of the "action" for this bot will happend via Button presses 
 * see framework.on('attachmentAction',..) below
 */
var responded = false;
// Any good bot should process help requests
framework.hears(/help/i, function (bot) {
  responded = true;
  showHelp(bot)
    .catch((e) => logger.error(`Error displaying help in space "${bot.room.title}": ${e.message}`));
});

// start the lessons over
framework.hears(/start over/i, function (bot, trigger) {
  responded = true;
  cardArray[0].renderCard(bot, trigger);
});

// go to a lesson
framework.hears(/lesson ./, function (bot, trigger) {
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

// send a lesson card in response to any input
framework.hears(/.*/, function (bot, trigger) {
  if (!responded) {
    let currentLessonIndex =
      parseInt(bot.framework.mongoStore.recall(bot, 'currentLessonIndex'));
    if ((currentLessonIndex >= 0) && (currentLessonIndex < cardArray.length)) {
      cardArray[currentLessonIndex].renderCard(bot, trigger);
    } else {
      logger.error(`Got invalid index for current lesson: ${currentLessonIndex}.  Displaying intro lesson.`);
      cardArray[0].renderCard(bot, trigger);
    }
  }
  responded = false;
});

/*
 * framework.on('attachmentAction',..) processes Action.Submit
 * button requests 
 *
 * Note that Action.ShowCard and Action.OpenUrl are handled directly
 * in the Webex Teams client.  Our bot is not notified
 */
framework.on('attachmentAction', function (bot, trigger) {
  try {
    let attachmentAction = trigger.attachmentAction;
    logger.verbose(`Got an attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`);
    // Only process input from most recently displayed card
    if (attachmentAction.messageId !== bot.framework.mongoStore.recall(bot, 'activeCardMessageId')) {
      return bot.reply(attachmentAction, 'I do not process button clicks from old lessons.  Scroll down to the most recent lesson card, or post any message to get me to display a new lesson.');
    }
    // Go to next card (or ask this card to handle input)
    // TODO store info about the previous lesson for the Displaying Info lesson
    if (attachmentAction.inputs.nextLesson) {
      cardArray[attachmentAction.inputs.lessonIndex].renderCard(bot, trigger);
    } else if (attachmentAction.inputs.pickAnotherLesson) {
      cardArray[attachmentAction.inputs.jumpToLessonIndex].renderCard(bot, trigger);
    } else {
      // Handle card specific actions
      let index = parseInt(attachmentAction.inputs.myCardIndex);
      cardArray[index].handleSubmit(trigger, bot);
    }
  } catch (e) {
    logger.error(`Error processing AttachmentAction: ${e.message}`);
  }
});

async function showHelp(bot) {
  return bot.say('This bot provides Webex Teams users and developers with an ' +
    'opportunity to experience ' +
    '[Buttons and Cards](https://developer.webex.com/docs/api/guides/cards) ' +
    'and to learn more about them.\n\n' +
    'Through a series of lessons, presented using Buttons and Cards,' +
    'users will experience working with Cards, learn about how they are created ' +
    'and gain access to more resources to take their learning further.\n\n ' +
    'Most interaction takes place via buttons and cards but I do support a few text commands:\n\n ' +
    '* **help** - will present this message again\n' +
    `* **lesson X** - show card for a lesson, X is a digit: 0 - ${cardArray.length - 1}\n` +
    '* **start over** - will bring up the first lesson\n' +
    '* any other text input will re-render the current lesson card.');
}


// define express path for incoming webhooks
app.post('/', webhook(framework));

// Health Check
app.get('/', function (req, res) {
  if (process.env.DOCKER_BUILD) {
    res.send(`I'm alive, running in container built ${process.env.DOCKER_BUILD}.  To use this app add ${botEmail} to a Webex Teams space.`);
  } else {
    res.send(`I'm alive.  To use this app add ${botEmail} to a Webex Teams space.`);
  }
});

// start express server
var server = app.listen(frameworkConfig.port, function () {
  if (frameworkConfig.webhookUrl) {
    logger.info('Server started at %s listening on port %s', frameworkConfig.webhookUrl, frameworkConfig.port);
  } else {
    logger.info('Server listening on port %s', frameworkConfig.port);
  }
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function () {
    process.exit();
  });
});

