/*
 * build-cards.js
 *
 * Lessons are built dynamically from content files in the ./lesson-content directory
 * The order of the lessons is condigured in the file ./lesson-content/lesson-order.json
 * 
 * After all the content files are read in a new "common-actions.json" file is generated,
 * which will include a "Pick a Lesson" button with choices based on the lessons read in.
 * 
 * The final, generated lesson content, that combines the lesson content and the common-actions.json
 * is written to the generated directory which is read by the bot server upon startup
 * 
 * If you have created new content run `npm run build` to generate new card content
 * 
 */
let resourceDir = './lesson-content';
let sharedResourceDir = './shared-lesson-content';
let generatedDir = './generated';
let githubGeneratedDir = 'blob/master/generated';

// The Adaptive Cards Template SDK helps us populate a card design
// template with values from a data source
var ACData = require("adaptivecards-templating");

// Read URLs for Card and App source links from environment
require('dotenv').config();

if (!process.env.APP_SRC_BASE_URL) {
  console.error('Cannot read the environment variable APP_SRC_BASE_URL, needed to configure the buttons with links to the app and card source.');
  console.error('The lesson cards were NOT updated!\n');
  process.exit(0);
}
if (!process.env.CARD_SRC_BASE_URL) {
  console.error('Cannot read the environment variable CARD_SRC_BASE_URL, needed to configure the buttons with links to the card source.');
  console.error('The lesson cards were NOT updated!\n');
  process.exit(0);
}
if (!process.env.ASK_SPACE_URL) {
  console.error('Cannot read the environment variable ASK_SPACE_URL, needed to configure the buttons with links to the app and card source.');
  console.error('The lesson cards were NOT updated!\n');
  process.exit(0);
}
if (!process.env.IMAGE_HOSTING_URL) {
  console.error('Cannot read the environment variable IMAGE_HOSTING_URL, needed to display images on cards.');
  console.error('The lesson cards were NOT updated!\n');
  process.exit(0);
}

// Because we are using the promise version of fs
// we require node version > 10.x.  Validate that.
// Note: v11.0.0 or greater will remove the "experimental" warning output
const Fs = require('fs').promises;
let semver = require('semver');
let { engines } = require('./package');

const version = engines.node;
if (!semver.satisfies(process.version, version)) {
  console.log(`Required node version ${version} not satisfied with current version ${process.version}.`);
  console.error('The lesson cards were NOT updated!\n');
  console.log(`Please upgrade node to ${version} or more.  eg: https://www.hostingadvice.com/how-to/update-node-js-latest-version/`);
  process.exit(0);
}

buildAllLessons(resourceDir, sharedResourceDir, generatedDir);

async function buildAllLessons(resourceDir, sharedResourceDir, generatedDir) {
  try {
    console.log(`Looking for lesson content...`);

    // Read in each lesson based on lesson-order.json
    let lessonList = await generateLessonList(resourceDir, generatedDir);

    // Generate the "Pick A Lesson" button that will be common for all lessons
    let generatedActions = await generateActions(`${sharedResourceDir}/common-actions.json`,
      lessonList, generatedDir);

    // // OK, lets append the Next Lesson and More Options button to each lesson
    // // and write out the complete generated content to lesson-X content files
    nextLesson = require(`${sharedResourceDir}/next-lesson.json`);

    let i;
    for (i = 0; i < lessonList.length - 1; i++) {
      let nextLessonInfo = (i < lessonList.length - 1) ? lessonList[i + 1] : null;
      let fileContent = `${resourceDir}/${lessonList[i].contentFile}`;
      let cardJson = buildCard(i, fileContent, generatedActions, nextLessonInfo, nextLesson);
      generateCardFile(i, cardJson, generatedDir);
    }

    // For the final "graudation" card we'll modify the content a bit
    // Providing fewer of the "more resources" buttons
    let fileContent = `${resourceDir}/${lessonList[i].contentFile}`;
    let graduationJson = buildCard(i, fileContent, generatedActions);
    let submitFeedback = graduationJson.actions[1].card.body[1];
    let pickALesson = graduationJson.actions[0];
    pickALesson.title = "Review a Previous Lesson";
    let pickALessonContainer = {
      type: 'Container',
      items: [
        {
          type: "ActionSet",
          actions: [pickALesson]
        }
      ]
    };
    delete graduationJson.actions;
    graduationJson.body.push(submitFeedback);
    graduationJson.body.push(pickALessonContainer);
    generateCardFile(i, graduationJson, generatedDir);


    console.log('\nAll done!  Type: `npm run start` to start the bot with the new content.');
  } catch (e) {
    console.error(`Error generating cards: ${e.message}`);
  }
}

function buildCard(contentIndex, lessonContent, actionContent, nextLessonInfo, nextLessonTemplate) {
  try {
    // Read in the lesson specific info
    let card = require(lessonContent);

    // Include the Lesson Index in the title (except for Welcome and Graduation)
    if ((contentIndex > 0) && (nextLessonInfo)) {
      card.body[0].text = `Lesson ${contentIndex}: ${card.body[0].text}`;
    }

    // Action.Submit data includes an Input.X element values 
    // Add a hidden Input.Choice block that will ensure that our
    // card's index is always returned with every action
    card.body.push({
      type: "Input.ChoiceSet",
      id: "myCardIndex",
      value: `${contentIndex}`,
      isMultiSelect: false,
      isVisible: false,
      choices: [
        {
          title: "This hidden choice ensures that myCardIndex is returned with every Action.Submit attachmentAction",
          value: `${contentIndex}`
        }
      ]
    });

    if (nextLessonInfo) {
      // Build the "Next Lesson" button
      let nextLessonButton = nextLessonTemplate;
      if ((nextLessonButton.items[0].type !== 'ActionSet') || (nextLessonButton.items[0].actions[0].type !== 'Action.Submit')) {
        throw new Error(`${nextLessonTemplate} did not define the expected ActionSet and Action.Sumbit schema elements`);
      }
      nextLessonButton.items[0].actions[0].title = "Next Lesson: " + nextLessonInfo.title;
      nextLessonButton.items[0].actions[0].data.lessonIndex = nextLessonInfo.index;
      card.body.push(nextLessonButton);
    }

    // Add the "Pick Another Lesson" and "More Resources" buttons shared by all cards
    card.actions = actionContent;
    let populatedCard = card;

    // Now that the complete card has been built, lets update any templatized values
    if (nextLessonInfo) {
      // We dont expand the template for the graduation card until it is rendered
      var template = new ACData.Template(card);
      var appSource = process.env.APP_SRC_BASE_URL;
      var cardSource = process.env.CARD_SRC_BASE_URL;
      var cardSource = (cardSource[cardSource.length - 1] === '/') ?
        cardSource + `lesson-${contentIndex}` :
        cardSource + `/lesson-${contentIndex}`;
      var context = new ACData.EvaluationContext();
      context.$root = {
        appSourceUrl: appSource,
        cardSourceUrl: cardSource,
        askSpaceUrl: process.env.ASK_SPACE_URL,
        imageHostingUrl: process.env.IMAGE_HOSTING_URL,
        nextLessonIndex: `${nextLessonInfo.index}`
      };
      // "Expand" any templatized components into the final card
      populatedCard = template.expand(context);
    }

    return populatedCard;
  } catch (e) {
    console.error(`Error generating cards: ${e.message}`);
    process.exit(-1);
  }
};

function generateCardFile(index, card, path) {
  const json = JSON.stringify(card, null, 2);
  const fileName = `${path}/lesson-${index}.json`;
  console.log(`Generating complete card content for "${card.body[0].text}" as ${fileName} ...`);
  Fs.writeFile(fileName, json)
    .catch((e) => console.error(`Failed generating lesson-${index}.json: ${e.message}`));
};

// Read the content files through to generate a "lesson list" that we 
// will use to generate the "Pick A Lesson" button content
async function generateLessonList(contentPath, generatedPath) {
  try {
    let lesson;
    let index = 0;
    let lessons = require(`${contentPath}/lesson-order.json`);
    for (lesson of lessons) {
      // Update our lesson list with the title and index for each lesson
      const lessonConent = require(`${contentPath}/${lesson.contentFile}`);
      console.log(`Lesson ${index}: ${lessonConent.body[0].text}`);
      lessons[index].index = index;
      lessons[index].title = lessonConent.body[0].text;
      index += 1;
    }
    // Write our updated lesson list array to the generated content directory
    // Our bot will use this to load in the lesson content
    const json = JSON.stringify(lessons, null, 2);
    await Fs.writeFile(`${generatedPath}/lesson-list.json`, json);
    return lessons;
  } catch (e) {
    console.log(`Error reading in lesson content: ${e.message}`);
    process.exit(0);
  }
}

// Based on the updated lesson list which includes each lessons title and index
// Build the "Pick Another Lesson" button that will be shared by all lessons
async function generateActions(actionsTemplate, lessonList, generatedPath) {
  actions = {};
  try {
    actions = require(actionsTemplate);
    console.log(`Found ${actionsTemplate}, generating "Pick Another Lesson" options...`);
    if (actions[0].title !== "Pick Another Lesson") {
      throw new Error(`${actionsTemplate} did not define the expected "Pick Another Lesson" action`);
    }
    if (actions[0].card.body[0].items[1].type !== "Input.ChoiceSet") {
      throw new Error(`${actionsTemplate} did not define the expected Input.ChoiceSet in the Pick Another Lesson card`);
    }
    // if (actions[1].card.body[0].type !== "ActionSet") {
    //   throw new Error(`${actionsTemplate} did not define the expected ActionSet in the More Options Lesson card`);
    // }
    actions[0].card.body[0].items[1].choices = [];
    actions[0].card.body[0].items[1].choices.push(
      {
        "title": "Introduction",
        "value": "0"
      });

    // We will hide the graduation card from the pick list
    for (i = 1; i < lessonList.length - 1; i++) {
      actions[0].card.body[0].items[1].choices.push({
        title: `Lesson ${i}: ${lessonList[i].title}`,
        value: `${i}`
      });
    }

    const json = JSON.stringify(actions, null, 2);
    await Fs.writeFile(`${generatedPath}/common-actions.json`, json);
    console.log("Ready to build full card data...\n");
    return actions;
  } catch (e) {
    console.error(`Failed generating "Pick Another Lesson" button options: ${e.meessage}`);
    process.exit(-1);
  }
}


