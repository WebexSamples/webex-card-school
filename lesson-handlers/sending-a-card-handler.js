/**
 * Sending a Card Lesson specific handlers
 **/

class SendingACardHandlers {

  async customRenderCard(bot, trigger, cardObject, logger) {
    let card = cardObject.cardJSON;
    try {
      // Add this room's ID to the message payload
      // This is buried deep in our card JSON as an adaptive card
      // within a Action.ShowCard, see ../lesson-content/sending-a-card-content.json
      // THis is brittle and will break if the underlying design changes
      card.body[6].items[0].actions[0].card.body[0].items[0].text =
        card.body[6].items[0].actions[0].card.body[0].items[0].text.replace(/{{roomId}}/, bot.room.id);
    } catch (e) {
      logger.error(`SendingACardHandlers.customRenderCard did not find the expected example card JSON: ${e.message}`);
      bot.say('Unable to render card. Please contact the Webex Developer Support: https://developer.webex.com/support')
        .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
    }
    bot.sendCard(card, "If you see this your client cannot render our Introduction Card.   Try using a different Webex Teams client with this bot.")
      .then((message) => {
        if ('id' in message) {
          bot.store('activeCardMessageId', message.id);
        }
      })
      .catch((err) => {
        let msg = 'Failed to render Sending A Card lesson.';
        logger.error(`${msg} Error:${err.message}`);
        bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
          .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
      });
  };

  async customActionHandler(trigger, bot, cardObj) {
    try {
      let attachmentAction = trigger.attachmentAction;
      if (attachmentAction.inputs.customPostMessage) {
        await bot.reply(attachmentAction, 'Posting the request body above to the /messaages API.   New card should render below...');
        // In the card, our /messages request body is formatted as a JSON string
        // turn it back into a proper JSON object
        // This is buried deep in our card JSON as an adaptive card
        // within a Action.ShowCard, see ../lesson-content/sending-a-card-content.json
        let requestBody = cardObj.cardJSON.body[6].items[0].actions[0].card.body[0].items[0].text;
        requestBody = requestBody.replace(/```json/, '');
        requestBody = JSON.parse(requestBody);
        requestBody.roomId = bot.room.id;
        // The following is the equivilent of doing a POST /messages call a request body
        // that matches the one displayed in this card.   The framework's bot.say method
        // is simply a convenience wrapper that POSTs via node's request library
        await bot.say(requestBody);
        await bot.say('Hit the "Next Lesson" button in the card above to continue...');
        return true;
      }
      return false;
    } catch (e) {
      cardObj.logger.error(`SendingACardHandlers.customActionHandler failed: ${e.message}`);
      bot.say('Error sending message.  Contact Developer Support');
      return false;
    }
  };

};

module.exports = SendingACardHandlers;