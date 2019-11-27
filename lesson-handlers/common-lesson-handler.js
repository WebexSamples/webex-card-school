/**
 * This is the generic lesson handler
 **/

class LessonHandler {
  constructor(card, srcBaseUrl, contentType, lessonInfo, customHandlers) {
    this.card = card;
    this.lessonInfo = lessonInfo;
    this.customHandlers = customHandlers;
    // if (lessonInfo.customHandlerFile) {
    //   // try {
    //     //this.customHandlers = require(`./lesson-handlers/${lessonInfo.customHandlerFile}`);
    //     console.log(process.cwd());
    //     let customHandlers = require('./lesson-handlers/sending-a-card-handler.js');
    //     // } catch (e) {
    //   //   console.error(`During initiatlization error reading in custom card handler: ${e.message}`);
    //   //   console.error(`Inspect content in lesson-content/lesson-order.json`);
    //   //   process.exit(-1);      
    //   // }
    // }
    this.contentType = contentType;
    this.srcUrl = (srcBaseUrl[srcBaseUrl.length - 1] === '/') ?
      srcBaseUrl + 'sample-picker.js' :
      srcBaseUrl + '/sample-picker.js';
  }

  async renderCard(bot, trigger, logger) {
    if ((this.customHandlers) && (typeof this.customHandlers.customRenderCard == 'function')) {
      return this.customHandlers.customRenderCard(bot, trigger, this, logger);
    }
    bot.sendCard(this.card, "If you see this your client cannot render our Introduction Card.   Try using a different Webex Teams client with this bot.")
      .catch((err) => {
        let msg = 'Failed to render Introduction card.';
        logger.error(`${msg} Error:${err.message}`);
        bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
          .catch((e) => logger.error(`Failed to post error message to space. Error:${e.message}`));
      });
  };

  async  handleSubmit(attachmentAction, submitter, bot, logger) {
    if ((this.customHandlers) && (typeof this.customHandlers.customActionHandler == 'function')) {
      // Let lesson specific handlers have first crack at this
      let responded = await this.customHandlers.customActionHandler(attachmentAction, submitter, bot, logger);
      if (responded) {
        return true;
      }
    }
    if (attachmentAction.inputs.feedback) {
      handleFeedback(bot, submitter, attachmentAction, this.lessonInfo);
    } else if (attachmentAction.inputs.showCardSource) {
      bot.reply(attachmentAction,
        `Show Card Source not implmented.  Need to post or show a link`)
        .catch((e) => logger.error(`Failed handling a "Send Feedback: ${e.message}`));
    } else {
      bot.reply(attachmentAction,
        `Unhandled attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`)
        .catch((e) => logger.error(`Failed handling a "Send Feedback: ${e.message}`));
    }
  };

};

function handleFeedback(bot, submitter, attachmentAction, lessonInfo) {
  // TODO -- write this to a database
  // TODO -- write this to a feedback space (adminsBot?)
  bot.reply(attachmentAction, 'Feedback not implmented.  Want to store:\n' +
    `* User: ${submitter.displayName} \n` +
    `* Email: ${submitter.emails[0]} \n` +
    `* Space: ${bot.room.title}\n` +
    `* Lesson: ${lessonInfo.title}\n` +
    `* Date: ${attachmentAction.created} \n` +
    `* feedback: ${attachmentAction.inputs.feedback}`)
    .catch((e) => logger.error(`Failed handling a "Send Feedback: ${e.message}`));
}


module.exports = LessonHandler;