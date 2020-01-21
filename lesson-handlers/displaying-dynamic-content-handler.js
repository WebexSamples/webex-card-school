/**
 * Displaying Dynamic Content Lesson specific handlers
 **/
let moment = require('moment');
// The Adaptive Cards Template SDK helps us populate a card design
// template with values from a data source
let ACData = require("adaptivecards-templating");


class DisplayingDynamicContentHandlers {

  /**
   * This lesson's custom render will read in a predefined generic "contact card",
   * and populate elements of it based on information we now have about the user using
   * the Adaptive Cards Templating SDK (which we require'd just above...)
   * It then adds this card to the array of items in this lesson's main card, resulting
   * in an Action.ShowCard button titled "Show the Dynamic Student Info Card"
   **/
  async customRenderCard(bot, trigger, cardObj, logger, lessonState) {
    try {
      // Read in the generic "contact card" and populate it
      let templatePayload = require('../lesson-content/student-info-template.json');
      // Create a Template instamce from the template payload
      let template = new ACData.Template(templatePayload);
      let imageHostingUrl = process.env.IMAGE_HOSTING_URL;

      if (!process.env.IMAGE_HOSTING_URL) {
        logger.error(`graduation card customerRenderCard() is going to fail ` +
          `because the IMAGE_HOSTING_URL environment variable is not set.`);
        bot.say('Cannot send graduation card.  Please contact the Webex Developer Support:' +
          ' https://developer.webex.com/support` and report that IMAGE_HOSTING_URL is not' +
          ' properly set for this bot.');
      }

      // Create a data binding context, and set its $root property to the
      // data object to bind the template to, in this case our student info
      let context = new ACData.EvaluationContext();
      context.$root = {
        avatar: (trigger.person.avatar) ? trigger.person.avatar : `${imageHostingUrl}/missing-avatar.jpg`,
        name: trigger.person.displayName,
        email: trigger.person.emails[0],
        currentLesson: cardObj.lessonInfo.title,
        previousLesson: (typeof lessonState.previousLessonIndex !== 'number') ? 'Unknown' :
          cardObj.lessons[parseInt(lessonState.previousLessonIndex)].title,
        studentInfoTemplate: `${process.env.APP_SRC_BASE_URL}/blob/master/lesson-content/student-info-template.json`,
        customRenderSource: `${process.env.APP_SRC_BASE_URL}/blob/master/lesson-handlers/displaying-dynamic-content-handler.js`,
        date: `${moment.utc().format('lll')} GMT`
      };
      if (trigger.type != 'attachmentAction') {
        context.$root.requestedVia = `Message to Bot: ${trigger.message.text}`;
      } else {
        let inputs = trigger.attachmentAction.inputs;
        if (inputs.nextLesson) {
          context.$root.requestedVia = 'Next Lesson Button';
        } else if (inputs.pickAnotherLesson) {
          context.$root.requestedVia = 'Pick Another Lesson Button';
        } else {
          context.$root.requestedVia = 'Unknown';
        }
      }

      // "Expand" the template - to generate user specific sub-card
      let card = template.expand(context);

      // Make a copy of the generated student inf card and insert this
      // into the Action.ShowCard in the overall lesson card
      let theCard = JSON.parse(JSON.stringify(cardObj.cardJSON));
      // Update the Action.ShowCard elements card attribute
      // This is a bit brittle as it will break if the lesson changes
      theCard.body[5].items[0].actions[0].card = card;

      bot.sendCard(theCard, `If you see this your client cannot render the card for ${cardObj.lessonInfo.title}.   Try using a different Webex Teams client with this bot.`)
        .then((message) => {
          if ('id' in message) {
            bot.store('activeCardMessageId', message.id)
              .catch((e) => logger.error(`Failed to store active card message ID. Error:${e.message}`));
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

module.exports = DisplayingDynamicContentHandlers;