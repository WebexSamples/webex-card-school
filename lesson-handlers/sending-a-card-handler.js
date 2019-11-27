/**
 * Sending a Card Lesson specific handlers
 **/

class SendingACardHandlers {

  async customRenderCard(bot, trigger, cardObject, logger) {
    let card = cardObject.card;
    // Add this room's ID to the message payload
    if (0 === card.body[3].text.indexOf('```json')) {
      card.body[3].text = card.body[3].text.replace(/{{roomId}}/, bot.room.id);
    } else {
      logger.error('SendingACardHandlers.customRenderCard did not find the expected example card JSON at cards.body[3].text');
    }
    bot.sendCard(card, "If you see this your client cannot render our Introduction Card.   Try using a different Webex Teams client with this bot.")
      .catch((err) => {
        let msg = 'Failed to render Sending A Card lesson.';
        logger.error(`${msg} Error:${err.message}`);
        bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
          .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
      });
  };

  async customActionHandler(attachmentAction, submitter, bot, logger) {
    try {
      if (attachmentAction.inputs.customPostMessage) {
        await bot.reply(attachmentAction, 'Will add post message logic here');
        return true;
      }
      return false;
    } catch(e) {
      logger.error(`SendingACardHandlers.customActionHandler failed: ${e.message}`);
      bot.say('Error sending message.  Contact Developer Support');
      return false;
    }
  };

};

module.exports = SendingACardHandlers;