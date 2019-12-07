/**
 * This is the generic lesson handler
 **/

class LessonHandler {
  constructor(card, logger, lessons, thisLessonInfo, metricsTables, customHandlers) {
    this.card = card;
    this.logger = logger;
    this.lessons = lessons;
    this.lessonInfo = thisLessonInfo;

    this.metricsTable = '';
    if ((typeof metricsTables === "object") && (metricsTables.length > 0)) {
      this.metricsTable = metricsTables[0];
      if (metricsTables.length > 1) {
        this.logger.warn(`Unexpected Metrics DB Table names including ${metricsTables[1]} passed to LessonHandler constructor`);
      }
    }

    this.customHandlers = customHandlers;
  }

  async renderCard(bot, trigger) {
    // Update the indices for the current and previous lesson
    bot.framework.mongoStore.store(bot, 'previousLessonIndex',
      bot.framework.mongoStore.recall(bot, 'currentLessonIndex'));
    bot.framework.mongoStore.store(bot, 'currentLessonIndex', this.lessonInfo.index);

    // Write metrics that this card was loaded
    bot.framework.mongoStore.writeMetric(this.metricsTable, 'cardRendered', bot, trigger.person, this, trigger);

    if ((this.customHandlers) && (typeof this.customHandlers.customRenderCard == 'function')) {
      return this.customHandlers.customRenderCard(bot, trigger, this, this.logger);
    }
    bot.sendCard(this.card, "If you see this your client cannot render our Introduction Card.   Try using a different Webex Teams client with this bot.")
      .then((message) => {
        if ('id' in message) {
          bot.framework.mongoStore.store(bot, 'activeCardMessageId', message.id);
        }
      })
      .catch((err) => {
        let msg = 'Failed to render Introduction card.';
        this.logger.error(`${msg} Error:${err.message}`);
        bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
          .catch((e) => this.logger.error(`Failed to post error message to space. Error:${e.message}`));
      });
  };

  async  handleSubmit(trigger, bot) {
    let attachmentAction = trigger.attachmentAction;
    let submitter = trigger.person; 
    if ((this.customHandlers) && (typeof this.customHandlers.customActionHandler == 'function')) {
      // Let lesson specific handlers have first crack at this
      let responded = await this.customHandlers.customActionHandler(attachmentAction, submitter, bot, this.logger);
      if (responded) {
        return true;
      }
    }
    if (attachmentAction.inputs.feedback) {
      this.handleFeedback(bot, trigger, this.lessonInfo);
    } else if (attachmentAction.inputs.showCardSource) {
      bot.reply(attachmentAction,
        `Show Card Source not implmented.  Need to post or show a link`)
        .catch((e) => this.logger.error(`Failed handling a "Send Feedback: ${e.message}`));
    } else {
      bot.reply(attachmentAction,
        `Unhandled attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`)
        .catch((e) => this.logger.error(`Failed handling a "Send Feedback: ${e.message}`));
    }
  };

  handleFeedback(bot, trigger, lessonInfo) {
    let attachmentAction = trigger.attachmentAction;
    let submitter = trigger.person; 
    // Write metrics that feedback was provided
    bot.framework.mongoStore.writeMetric(this.metricsTable, 'feedbackProvided', bot, submitter, this, trigger);
  
    if (bot.framework.adminsBot) {
      return bot.framework.adminsBot.say('markdown', 'Feedback sumbitted:\n' +
        `* User: ${submitter.emails[0]} - ${submitter.displayName} \n` +
        `* Space: ${bot.room.title}\n` +
        `* Lesson: ${lessonInfo.title}\n` +
        `* Date: ${attachmentAction.created} \n` +
        `* feedback: ${attachmentAction.inputs.feedback}`)
        .then(() => bot.reply(attachmentAction, 
          `Your feedback: "${attachmentAction.inputs.feedback}", has been captured.  THANK YOU!`))
        .catch((e) => this.logger.error(`Failed handling a "Send Feedback: ${e.message}`));
    }
    bot.reply(attachmentAction, 'Feedback not implmented.  Want to store:\n' +
      `* User: ${submitter.displayName} \n` +
      `* Email: ${submitter.emails[0]} \n` +
      `* Space: ${bot.room.title}\n` +
      `* Lesson: ${lessonInfo.title}\n` +
      `* Date: ${attachmentAction.created} \n` +
      `* feedback: ${attachmentAction.inputs.feedback}`)
      .catch((e) => this.logger.error(`Failed handling a "Send Feedback: ${e.message}`));
  };  

};



module.exports = LessonHandler;