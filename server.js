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
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

var _ = require('lodash');

// When running locally read environment variables from a .env file
require('dotenv').config();
logger = require('./logger');

// Print out the docker container build date if available
if (process.env.DOCKER_BUILD) {
  logger.info('\n\n\nSERVICE RESTARTING...\n\n\n');
  logger.info(`Starting app in docker container built: ${process.env.DOCKER_BUILD}`);
}

// The admin user or 'admin space' get extra notifications about bot usage
// If both are set we prefer the space
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
    '* MONGO_INIT_STORAGE -- stringified ojbect aassigned as the default startup config if non exists yet\n' +
    '* MONGO_SINGLE_INSTANCE_MODE -- Optimize lookups speeds when only a single bot server instance is running\n\n' +
    'Also note, the mongodb module v3.4 or higher must be available (this is not included in the framework\'s default dependencies)');
  logger.error('Running without having these set will mean that there will be no persistent storage \n' +
    'across server restarts, and that no metrics will be written.  Generally this is a bad thing.');
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
      logger.error(`Initialization with mongo storage failed: ${e.message}`)
      process.exit(-1);
    });
} else {
  framework.start()
    .catch((e) => {
      logger.error(`Framework.start() failed: ${e.message}.  Exiting`);
      process.exit(-1);
    });
}

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

// Called after the framework has registerd all necessary webhooks
// and discovered all the existing spaces that our bot is already in
framework.on("initialized", function () {
  logger.info("Framework initialized successfully! [Press CTRL-C to quit]");
});


// Called when the framework creates a new bot instance for us
// At startup, (before the framework is fully initialized), this
// is called when the framework discovers an existing space that
// our bot is in.
// After initialization, if our bot is added to a new space the 
// framework processes the membership:created event, creates a
// new bot object and generates a new spawn event.
framework.on('spawn', async function (bot, id, addedById) {
  // Save framework init status when this handler was first called
  let initialized = framework.initialized;
  let addedByPerson = null;
  // Notify the admin if the bot has been added to a new space
  if (!initialized) {
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
    // await framework.mongoStore.onSpawn(bot, initiatlized, metricsTables);
    if (addedById) {
      addedByPerson = await this.webex.people.get(addedById);
    }
    // Look for the "old style" db entries and convert them
    // It should only be necessary to do this once
    await updateBotStorageFromV1toV2(bot, initialized);

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

  // See if this is the bot that belongs to our admin space
  if ((!adminsBot) && (bot.isDirect) && (adminEmail) &&
    (bot.isDirectTo.toLocaleLowerCase() === adminEmail.toLocaleLowerCase())) {
    adminsBot = bot;
    this.adminsBot = adminsBot;
  } else if ((!adminsBot) && (adminSpaceId) && (bot.room.id === adminSpaceId)) {
    adminsBot = bot;
    this.adminsBot = adminsBot;
  }

  if (initialized) {
    // Our bot has just been added to a new space!  
    // Since we just got added, say hello
    showHelp(bot)
      .then(() => cardArray[0].renderCard(bot, { message: { text: 'Initial Add Action' }, person: addedByPerson })
        .catch((e) => logger.error(`Error starting up in space "${bot.room.title}": ${e.message}`)));

    // Notify any admins via Webex Teams
    if (adminsBot) {
      let msg = `${bot.person.displayName} was added to a space: "${bot.room.title}"`;
      if (addedByPerson) {
        msg += ` by ${addedByPerson.displayName}`;
      }
      adminsBot.say(msg)
        .catch((e) => logger.error(`Failed to update to Admin about a new bot. Error:${e.message}`));
    }
    // Add some info to this bot's config
    let spaceInfo = {
      origTitle: bot.room.title
    };
    if (addedByPerson) {
      spaceInfo.addedBy = addedByPerson.displayName;
      spaceInfo.addedByEmail = addedByPerson.emails[0];
    }
    await bot.store('spaceInfo', spaceInfo);

    // Write to our metrics DB
    bot.writeMetric({ 'event': 'botAddedToSpace' }, addedByPerson);
  }
});

// Look for old (v1) flat data and convert it
// to the new (v2) object style that reduces DB reads
async function updateBotStorageFromV1toV2(bot, initialized) {
  try {
    let currentLessonIndex = await bot.recall('currentLessonIndex');
    let previousLessonIndex = await bot.recall('previousLessonIndex');
    logger.info(`Converting to lessonState for spaceId: ${bot.room.id}`);
    let lessonState = {
      currentLessonIndex,
      previousLessonIndex,
      totalLessons: 0
    };
    await bot.forget('currentLessonIndex');
    await bot.forget('previousLessonIndex');
    await bot.store('lessonState', lessonState);
  } catch (e) {
    logger.info(`Did not find old style lesson indices for spaceId: ${bot.room.id}`);
  }
  try {
    let betaModeEnabled = await bot.recall('betaModeEnabled');
    let betaModeValidUser = await bot.recall('betaModeValidUser');
    let betaModeAllowed = await bot.recall('betaModeAllowed');
    logger.info(`Converting to betaModeState for spaceId: ${bot.room.id}`);
    let betaModeState = {
      validUser: betaModeValidUser,
      enabled: betaModeEnabled,
      allowed: betaModeAllowed
    };
    await bot.forget('betaModeEnabled');
    await bot.forget('betaModeValidUser');
    await bot.forget('betaModeAllowed');
    await bot.store('betaModeState', betaModeState);
  } catch (e) {
    logger.info(`Did not find old style betaMode info for spaceId: ${bot.room.id}`);
  }
  if (!initialized) {
    let spaceInfo = {};
    try {
      spaceInfo = await bot.recall('spaceInfo');
    } catch (e) {
      // Add some info to this bot's config
      spaceInfo = {
        origTitle: bot.room.title
      };
      await bot.store('spaceInfo', spaceInfo);
    }
  }
}


framework.on('despawn', async function (bot, id, removedById) {
  logger.info(`Bot has been removed from space "${bot.room.title}"`);
  bot.writeMetric({ 'event': 'botRemovedFromSpace' }, removedById);
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
framework.hears(/.*/, async function (bot, trigger) {
  if (!responded) {
    try {
      let lessonState = await bot.recall('lessonState');
      let currentLessonIndex = parseInt(lessonState.currentLessonIndex);
      if ((currentLessonIndex >= 0) && (currentLessonIndex < cardArray.length)) {
        cardArray[currentLessonIndex].renderCard(bot, trigger, lessonState);
      } else {
        logger.error(`Got invalid index for current lesson: ${currentLessonIndex}.  Displaying intro lesson.`);
        cardArray[0].renderCard(bot, trigger);
      }
    } catch (e) {
      logger.error(`Failed looking up  current lesson: ${e.message}.  Displaying intro lesson.`);
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
framework.on('attachmentAction', async function (bot, trigger) {
  try {
    let attachmentAction = trigger.attachmentAction;
    logger.verbose(`Got an attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`);
    try {
      // Only process input from most recently displayed card
      let activeCardMessageId = await bot.recall('activeCardMessageId');
      if (attachmentAction.messageId !== activeCardMessageId) {
        return bot.reply(attachmentAction, 'I do not process button clicks from old lessons.  Scroll down to the most recent lesson card, or post any message to get me to display a new lesson.');
      }
    } catch (e) {
      logger.error(`${e.message}` +
        'DB State may be out of wack. Will process button click and try to recover...');
    }

    // Go to next card (or ask this card to handle input)
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