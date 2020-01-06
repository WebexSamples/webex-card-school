/**
 * Displaying Complex Info Lesson specific handlers
 **/

// The Adaptive Cards Template SDK helps us populate a card design
// template with values from a data source
var ACData = require("adaptivecards-templating");

class GraduationHandlers {

  /**
   * This lesson's custom render will use the Adaptive Cards Template SDK
   * to dynamically populate the values in the "name" and "avatar" fields
   * in the graduation card's design JSON
   **/
  async customRenderCard(bot, trigger, cardObj, logger) {
    try {
      // Create a Template instance from the graduation cards design JSON
      let template = new ACData.Template(cardObj.cardJSON);
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
        imageHostingUrl: imageHostingUrl
      };

      // "Expand" the template - to generate user specific sub-card
      let card = template.expand(context);
      bot.sendCard(card, `If you see this your client cannot render the card for ${cardObj.lessonInfo.title}.   Try using a different Webex Teams client with this bot.`)
        .then((message) => {
          if ('id' in message) {
            bot.store('activeCardMessageId', message.id)
              .then(() => bot.store('seenGraduation', true))
              .catch((e) => logger.error(`Failed to store graduation metrics. Error:${e.message}`));
          }
        })
        .catch((err) => {
          let msg = `Failed to render ${cardObj.lessonInfo.title} lesson.`;
          logger.error(`${msg} Error:${err.message}`);
          bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
            .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
        });
    } catch (e) {
      let msg = `Failed in the custom render logic for the ${cardObj.lessonInfo.title} lesson.`;
      logger.error(`${msg} Error:${e.message}`);
      bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
        .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
    }
  };

};

module.exports = GraduationHandlers;