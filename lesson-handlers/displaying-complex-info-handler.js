/**
 * Displaying Complex Info Lesson specific handlers
 **/

// The Adaptive Cards Template SDK helps us populate a card design
// template with values from a data source
var ACData = require("adaptivecards-templating");


class DisplayingComplexInfoHandlers {

  /**
   * This lesson's custom render will read in a predefined generic "contact card",
   * and populate elements of it based on information we now have about the user.
   * It then adds this card to the array of items in this lesson's main card, resulting
   * in an Action.ShowCard button titled "Show the Complex Info Card"
   **/
  async customRenderCard(bot, trigger, cardObj, logger) {
    try {
      // Read in the generic "contact card" and populate it
      var templatePayload = require('../lesson-content/student-info-template.json');
      // Create a Template instamce from the template payload
      var template = new ACData.Template(templatePayload);

      // Create a data binding context, and set its $root property to the
      // data object to bind the template to, in this case our student info
      var context = new ACData.EvaluationContext();
      context.$root = {
        avatar: trigger.person.avatar,
        name: trigger.person.displayName,
        email: trigger.person.emails[0],
        organization: "A Test Organization",
        currentLesson: cardObj.lessonInfo.title,
        previousLesson: cardObj.lessons[parseInt(bot.framework.mongoStore.recall(bot, 'previousLessonIndex'))].title,
        studentInfoTemplate: `${process.env.APP_SRC_BASE_URL}/blob/master/lesson-content/student-info-template.json` ,
        customRenderSource: `${process.env.APP_SRC_BASE_URL}/blob/master/lesson-handlers/displaying-complex-info-handler.js`
      };
      if (trigger.type != 'attachmentAction') {
        context.$root.date = trigger.message.created;
        context.$root.requestedVia = `Message to Bot: ${trigger.message.text}`;
      } else {
        let inputs = trigger.attachmentAction.inputs;
        context.$root.date = trigger.attachmentAction.created;
        if (inputs.nextLesson) {
          context.$root.requestedVia = 'Next Lesson Button';
        } else if (inputs.pickAnotherLesson) {
          context.$root.requestedVia = 'Pick Another Lesson Button';
        } else {
          context.$root.requestedVia = 'Unknown';
        }
      }

      // "Expand" the template - to generate user specific sub-card
      var card = template.expand(context);

      // Insert the genereted student info into the lesson card
      let theCard = JSON.parse(JSON.stringify(cardObj.card));
      // Update the Action.ShowCard elements card attribute
      // This is a bit brittle as it will break if the lesson changes
      theCard.body[4].items[0].actions[0].card = card;

      bot.sendCard(theCard, `If you see this your client cannot render the card for ${cardObj.lessonInfo.title}.   Try using a different Webex Teams client with this bot.`)
        .then((message) => {
          if ('id' in message) {
            bot.framework.mongoStore.store(bot, 'activeCardMessageId', message.id);
          }
        })
        .catch((err) => {
          let msg = 'Failed to render Displaying Complex Info lesson.';
          logger.error(`${msg} Error:${err.message}`);
          bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
            .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
        });
    } catch (e) {
      let msg = 'Failed to render Displaying Complex Info lesson.';
      logger.error(`${msg} Error:${e.message}`);
      bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
        .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
    }
  };

};

module.exports = DisplayingComplexInfoHandlers;