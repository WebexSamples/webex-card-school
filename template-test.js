/*
 * template-test.js
 *
 * Excersise the adaptive card template SDK and ensure it works
 * as expected.   This module is not needed or used by the 
 * cardSchool bot, but it may be handy as and example for developers 
 * interested in leveraging the adaptive card template sdk
 */
// Adaptive Cards Template SDK
var ACData = require("adaptivecards-templating");
// Write output file -- promises requires node v10 or greater.  v11 removes warning
const Fs = require('fs').promises;

let resourceDir = './lesson-content';
let generatedDir = './temp';

// Because we are using the promise version of fs
// we require node version > 10.x.  Validate that
let semver = require('semver');
let { engines } = require('./package');

const version = engines.node;
if (!semver.satisfies(process.version, version)) {
  console.log(`Required node version ${version} not satisfied with current version ${process.version}.`);
  console.error('The lesson cards were NOT updated!\n');
  console.log(`Please upgrade node to ${version} or more.  eg: https://www.hostingadvice.com/how-to/update-node-js-latest-version/`);
  process.exit(0);
}

doIt(resourceDir, generatedDir);

async function doIt(resourceDir, generatedDir) {
  try {
    console.log(`Reading in the sample template...`);
    var templatePayload = require(`${resourceDir}/student-info-template.json`);

    // Create a Template instamce from the template payload
    var template = new ACData.Template(templatePayload);

    // Create a data binding context, and set its $root property to the
    // data object to bind the template to
    var context = new ACData.EvaluationContext();
    context.$root = {
      avatar: "https://8e325148c33e40909d40-0b990d1d119de8e505829619be483465.ssl.cf1.rackcdn.com/V1~4d5020e6-313b-44d4-8023-6a9769e77303~5134da804c514716bab5d886985341d5~80",
      name: "A Test Bot",
      email: "testBot@webex.bot",
      organization: "A Test Organization",
      currentLesson: "Using a Template",
      requestedVia: "template-test.js",
      previousLesson: "unknown",
      date: "November 27, 2019"
    };

    // "Expand" the template - this generates the final Adaptive Card,
    // ready to render
    var card = template.expand(context);

    console.log('Populated Card:');
    console.log(card);

    const json = JSON.stringify(card, null, 2);
    const fileName = `${generatedDir}/student-info-populated.json`;
    Fs.writeFile(fileName, json)
      .catch((e) => console.error(`Failed generating lesson-${index}.json: ${e.message}`));
    //    Fs.writeFile(`${path}/lesson-${index}.json`, json);
  } catch (e) {
    console.error(`Template Test had a problem: ${e.message}`);
  }
};
