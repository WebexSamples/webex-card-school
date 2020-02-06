/**
 * This is the generic lesson handler
 **/

class LessonHandler {
  constructor(card, logger, lessons, thisLessonInfo, customHandlers) {
    this.cardJSON = card;
    this.logger = logger;
    this.lessons = lessons;
    this.lessonInfo = thisLessonInfo;

    this.customHandlers = customHandlers;
  }

  async renderCard(bot, trigger, lessonState) {
    if (typeof lessonState === 'undefined') {
      try {
        lessonState = await bot.recall('lessonState');
      } catch (e) {
        this.logger.error(`In renderCard Failed to get lessonState: ${e.message}.\n`);
        let previousLessonIndex = 'unknown';
        if ((trigger.type === 'attachmentAction') &&
          (typeof trigger.attachmentAction.inputs === 'object') &&
          (typeof trigger.attachmentAction.inputs.myCardIndex !== 'undefined')) {
          previousLessonIndex = parseInt(trigger.attachmentAction.inputs.myCardIndex);
        }
        lessonState = {
          currentLessonIndex: previousLessonIndex,
          totalLessons: 0
        };
      }
    }
    // Update the lesson activity data for this space
    lessonState.previousLessonIndex = lessonState.currentLessonIndex;
    lessonState.currentLessonIndex = this.lessonInfo.index;
    lessonState.totalLessons += 1;

    // Capture metrics and logs for this transition
    this.writeCardMetric(bot, 'cardRendered', trigger, lessonState);
    bot.store('lessonState', lessonState)
      .then(() => bot.store('lastActivity', new Date().toISOString())
        .catch((e) => this.logger.error(`renderCard(): failed writing lessonState to db: ${e.message}`)));

    // Render the new card (using a custom renderer if necessary...)
    if ((this.customHandlers) && (typeof this.customHandlers.customRenderCard == 'function')) {
      return this.customHandlers.customRenderCard(bot, trigger, this, this.logger, lessonState);
    }
    bot.sendCard(this.cardJSON,
      `If you see this your client cannot render the card for ${this.lessonInfo.title}.\n` +
      `Try using a different Webex Teams client with this bot.`)
      .then((message) => {
        if ('id' in message) {
          bot.store('activeCardMessageId', message.id)
            .catch((e) => logger.error(`Failed to store active card message ID. Error:${e.message}`));
        }
      })
      .catch((err) => {
        let msg = `Failed to render ${this.lessonInfo.title} card.`;
        this.logger.error(`${msg} Error:${err.message}`);
        bot.say(`${msg} Please contact the Webex Developer Support: https://developer.webex.com/support`)
          .catch((e) => this.logger.error(`Failed to post error message to space. Error:${e.message}`));
      });
  };

  async  handleSubmit(trigger, bot) {
    let attachmentAction = trigger.attachmentAction;
    if ((this.customHandlers) && (typeof this.customHandlers.customActionHandler == 'function')) {
      // Let lesson specific handlers have first crack at this
      let responded = await this.customHandlers.customActionHandler(trigger, bot, this);
      if (responded) {
        return true;
      }
    }
    if (attachmentAction.inputs.feedback) {
      this.handleFeedback(bot, trigger, this.lessonInfo);
    } else {
      let msg = `This bot doesn't currently do any logic for the button that you pressed, but here ` +
        ` is the body of the attachmentAction so you can see what your app would need to process:\n\n` +
        '```json\n' + `${JSON.stringify(attachmentAction, null, 2)}`;
      if (this.lessonInfo.title = "Form with Buttons Demo") {
        msg += '\n\n```\n\n' + 'It is worth noting that the `inputs` object ' +
          'captures data for the entire card, and not just the sub-card ' +
          'with the form on it.  The `myCardIndex`, `jumpToLessonIndex`, ' +
          'and `feedback` fields are used by this bot and exist for all the lessons.' +
          '\n\nClick the "Next Lesson" button in the card above to move on...';
      }
      bot.reply(attachmentAction, msg)
        .catch((e) => this.logger.error(`Failed handling a button press: ${e.message}`));
    }
  };

  handleFeedback(bot, trigger, lessonInfo) {
    let attachmentAction = trigger.attachmentAction;
    let submitter = trigger.person;
    // Write metrics that feedback was provided
    this.writeCardMetric(bot, 'feedbackProvided', trigger);

    bot.reply(attachmentAction,
      `Your feedback: "${attachmentAction.inputs.feedback}", has been captured.  THANK YOU!`)
      .catch((e) => this.logger.error(`Failed handling a "Send Feedback: ${e.message}`));

    if (bot.framework.adminsBot) {
      bot.framework.adminsBot.say('markdown', 'Feedback sumbitted:\n' +
        `* User: ${submitter.emails[0]} - ${submitter.displayName} \n` +
        `* Space: ${bot.room.title}\n` +
        `* Lesson: ${lessonInfo.title}\n` +
        `* Date: ${attachmentAction.created} \n` +
        `* feedback: ${attachmentAction.inputs.feedback}`)
        .catch((e) => this.logger.error(`Failed sending feedback to admin space: ${e.message}`));
    }
  };

  async writeCardMetric(bot, event, trigger, lessonState) {
    if (typeof lessonState === 'undefined') {
      try {
        lessonState = await bot.recall('lessonState');
      } catch (e) {
        this.logger.error(`In renderCard Failed to get lessonState: ${e.message}.\n`);
        let previousLessonIndex = 'unknown';
        if ((trigger.type === 'attachmentAction') &&
          (typeof trigger.attachmentAction.inputs === 'object') &&
          (typeof trigger.attachmentAction.inputs.myCardIndex !== 'undefined')) {
          previousLessonIndex = parseInt(trigger.attachmentAction.inputs.myCardIndex);
        }
        lessonState = {
          currentLessonIndex: previousLessonIndex,
          totalLessons: 0
        };
      }
    }
    // Write metrics that this card was loaded or used to send feedback
    let data = { event: event };
    let actorId = null;
    try {
      data.cardName = this.lessonInfo.title;
      data.cardIndex = this.lessonInfo.index;
      data.previousLesson = (lessonState.previousLessonIndex !== 'unknown') ?
        this.lessons[parseInt(lessonState.previousLessonIndex)].title : 'unknown';
      if (trigger.type === 'attachmentAction') {
        actorId = trigger.attachmentAction.personId;
      } else if (trigger.type === 'spawn') {
        // On a spawn event we have the full person object, use it
        actorId = trigger.person;
      } else { 
        actorId = trigger.message.personId;
      }
      if (event === 'cardRendered') {
        if (trigger.type != 'attachmentAction') {
          data.requestedVia = `Message to Bot: ${trigger.message.text}`;
        } else {
          let inputs = trigger.attachmentAction.inputs;
          if (inputs.nextLesson) {
            data.requestedVia = 'Next Lesson Button';
          } else if (inputs.pickAnotherLesson) {
            data.requestedVia = 'Pick Another Lesson Button';
          } else {
            data.requestedVia = 'Unknown';
          }
        }
      } else if (event === 'feedbackProvided') {
        data.feedback = trigger.attachmentAction.inputs.feedback;
      }
    } catch (e) {
      this.logger.error(`Error getting card info for ${event}: ${e.message}.  Will write metric with what we have.`);
    }
    bot.writeMetric(data, actorId)
      .catch((e) => this.logger.error(`Failed writing metric to DB about event ${event}: ${e.message}`));

    // Send a nice log message
    let msg = `Processing a "${data.event}" event in spaceID:"${bot.room.id}":\n` +
      `-- Space Name:    "${bot.room.title}"\n`;
    if (data.event === 'cardRendered') {
      msg += `-- Previous Card: "${data.previousLesson}"\n` +
        `-- Requested via: "${data.requestedVia}"\n` +
        `-- New card name: "${data.cardName}"\n`;
    } else if (data.event === 'feedbackProvided') {
      msg += `-- From Card:     "${data.previousLesson}"\n` +
        `-- Feedback:     "${data.feedback}"\n`;
    }
    if (data.actorDisplayName) {
      msg += `-- Student Name:  "${data.actorDisplayName}"\n`;
    }
    this.logger.info(msg);
  };

};



module.exports = LessonHandler;