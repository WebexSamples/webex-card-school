/**
 * This is the generic lesson handler
 **/

class LessonHandler {
  constructor(card, lessons, thisLessonInfo, customHandlers) {
    this.card = card;
    this.lessons = lessons;
    this.lessonInfo = thisLessonInfo;
    this.customHandlers = customHandlers;
    // this.contentType = contentType;

    // this.appSourceUrl = srcBaseUrl;
    // this.cardSourceUrl = (srcBaseUrl[srcBaseUrl.length - 1] === '/') ?
    //   srcBaseUrl + `generated/lesson-${lessonInfo.index}.json` :
    //   srcBaseUrl + `/generated/lesson-${lessonInfo.index}.json`;
  }

  async renderCard(bot, trigger, logger) {
    // Update the indices for the current and previous lesson
    bot.framework.mongoStore.store(bot, 'previousLessonIndex',
      bot.framework.mongoStore.recall(bot, 'currentLessonIndex'));
    bot.framework.mongoStore.store(bot, 'currentLessonIndex', this.lessonInfo.index);

    if ((this.customHandlers) && (typeof this.customHandlers.customRenderCard == 'function')) {
      return this.customHandlers.customRenderCard(bot, trigger, this, logger);
    }
    bot.sendCard(this.card, "If you see this your client cannot render our Introduction Card.   Try using a different Webex Teams client with this bot.")
      .then((message) => {
        if ('id' in message) {
          bot.framework.mongoStore.store(bot, 'activeCardMessageId', message.id);
        }
      })
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
  if (bot.framework.adminsBot) {
    return bot.framework.adminsBot.say('markdown', 'Feedback sumbitted:\n' +
      `* User: ${submitter.emails[0]} - ${submitter.displayName} \n` +
      `* Space: ${bot.room.title}\n` +
      `* Lesson: ${lessonInfo.title}\n` +
      `* Date: ${attachmentAction.created} \n` +
      `* feedback: ${attachmentAction.inputs.feedback}`)
      .then(() => bot.reply(attachmentAction, 
        `Your feedback: "${attachmentAction.inputs.feedback}", has been captured.  THANK YOU!`))
      .catch((e) => logger.error(`Failed handling a "Send Feedback: ${e.message}`));
  }
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