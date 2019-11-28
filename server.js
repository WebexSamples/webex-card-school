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
logger = require('./logger');

// When running locally read environment variables from a .env file
require('dotenv').config();

// Configure the bot framework for the environment we are running in
var frameworkConfig = {};
var cardsConfig = {};
if ((process.env.WEBHOOK) && (process.env.TOKEN) &&
  (process.env.PORT) && (process.env.CARD_CONENT_TYPE)) {
  frameworkConfig.webhookUrl = process.env.WEBHOOK;
  frameworkConfig.token = process.env.TOKEN;
  frameworkConfig.port = process.env.PORT;
  // Adaptive Card with images can take a long time to render
  // Extend the timeout when waiting for a webex API request to return
  frameworkConfig.requestTimeout = 60000;

  // Read the card schema and URL for the source example from environment
  cardsConfig.srcBaseUrl = process.env.CARD_SRC_BASE_URL;
  cardsConfig.contentType = process.env.CARD_CONENT_TYPE;
} else {
  logger.error('Cannot start server.  Missing required environment varialbles WEBHOOK, TOKEN or CARD_CONTENT_TYPE');
  process.exit();
}

// The beta-mode module allows us to restrict our bot to spaces
// that include a specified list of users
let validUsers = [];
let BetaMode = null;
if (process.env.EFT_USER_EMAILS) {
  validUsers = process.env.EFT_USER_EMAILS.split(',');
  if (validUsers.length) {
    BetaMode = require('./beta-mode');
  }
}


// The admin will get extra notifications about bot usage
let adminEmail = '';
let botEmail = 'the bot';
if (process.env.ADMIN_EMAIL) {
  adminEmail = process.env.ADMIN_EMAIL;
  botName = process.env.BOTNAME;
  botEmail = process.env.BOT_EMAIL;
} else {
  logger.error('No ADMIN_EMAIL environment variable.  Will not notify author about bot activity');
}
var adminsBot = null;


app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// init framework
var framework = new Framework(frameworkConfig);
framework.start();
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
    cardArray.push(new LessonHandler(cardJson, cardsConfig.srcBaseUrl,
      cardsConfig.contentType, lessons[i], customHandlers));
  }
} catch (e) {
  console.error(`During initiatlization error reading in card data: ${e.message}`);
  process.exit(-1);
}

framework.on("initialized", function () {
  logger.info("Framework initialized successfully! [Press CTRL-C to quit]");
});


framework.on('spawn', async function (bot) {
  // Save initialization status when this handler was first called
  let initiatlized = framework.initialized;
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

  // Ideally we fetch any existing betamode config from a database
  // before configuring it for this run of our server
  // TODO - read config out of db
  // If we specified EFT users, register the beta-mode module
  if (validUsers) {
    bot.betaMode = new BetaMode(bot, logger, true, ['jshipher@cisco.com']);
    await bot.betaMode.onSpawn();
  }
  // See if this instance is the 1-1 space with the admin
  if ((!adminsBot) && (bot.isDirect) &&
    (bot.isDirectTo.toLocaleLowerCase() === adminEmail.toLocaleLowerCase())) {
    adminsBot = bot;
  }

  if (initiatlized) {
    // Our bot has just been added to a new space!
    if (adminsBot) {
      adminsBot.say(`${bot.person.displayName} was added to a space: ${bot.room.title}`)
        .catch((e) => logger.error(`Failed to update to Admin about a new bot. Error:${e.message}`));
    }
    // Since we just got added, say hello
    showHelp(bot)
      .then(() => cardArray[0].renderCard(bot, null, logger))
      .catch((e) => logger.error(`Error starting up in space "${bot.room.title}": ${e.message}`));
  }
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
  cardArray[0].renderCard(bot, trigger, logger);
});

// go to a lesson
framework.hears(/lesson ./, function (bot, trigger) {
  console.log(trigger.args);
  const args = _.toLower(trigger.text).split(' ');
  let lessonIndex = args.indexOf('lesson');
  if ((lessonIndex > -1) && (lessonIndex < args.length - 1)) {
    let lesson = parseInt(trigger.args[lessonIndex + 1]);
    if ((lesson >= 0) && (lesson < cardArray.length)) {
      cardArray[lesson].renderCard(bot, trigger, logger);
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
    // TODO discover the current lessonfor the bot and render that one.
    cardArray[0].renderCard(bot, trigger, logger);
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
    // Go to next card (or ask this card to handle input)
    // TODO store info about the previous lesson for the Displaying Info lesson
    if (attachmentAction.inputs.nextLesson) {
      cardArray[attachmentAction.inputs.lessonIndex].renderCard(bot, trigger, logger);
    } else if (attachmentAction.inputs.pickAnotherLesson) {
      cardArray[attachmentAction.inputs.jumpToLessonIndex].renderCard(bot, trigger, logger);
    } else {
      // Handle card specific actions
      let index = parseInt(attachmentAction.inputs.myCardIndex);
      cardArray[index].handleSubmit(attachmentAction, trigger.person, bot, logger);
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
  res.send(`I'm alive.  To use this app add ${botEmail} to a Webex Teams space.`);
});

// start express server
var server = app.listen(frameworkConfig.port, function () {
  framework.debug('Framework listening on port %s', frameworkConfig.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function () {
    process.exit();
  });
});

