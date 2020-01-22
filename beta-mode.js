/*
 * beta-mode.js
 *
 * This module provides functionality to restrict usage of a bot
 * to only spaces where a predefined list of known users exist.
 * 
 * The initial implementation allows the bot to work if AT LEAST ONE
 * of the allowed users is in the space with the bot.
 * 
 * A future implementation may also support "exclusiveMode" where ALL
 * members of the space must be on the allowed user list
 */
var when = require('when');
var _ = require('lodash');

class BetaMode {
  /*
   * Instantiate a BetaMode object for each bot that is spawned
   */
  constructor(bot, logger, betaMode, validUsers, exclusiveMode /* default false*/) {
    if (typeof betaMode !== 'boolean') {
      logger.error('BetaMode constructor first parameter is not boolean');
      process.exit(-1);
    }
    if ((typeof validUsers !== 'object') || (validUsers.length <= 0)) {
      if (betaMode) {
        logger.warning('BetaMode was set to true, but no valid user list was supplied. Bot will work in all spaces');
        betaMode = false;
      }
    }

    this.bot;
    this.logger = logger;
    this.betaMode = betaMode; // passthrough if false
    this.validUsers = validUsers;
    this.exclusiveMode = (exclusiveMode === true) ? exclusiveMode : false;

    // Resassign the bot's say functions to the betaMode version
    bot.origSay = bot.say;
    bot.say = this.say;
    bot.origSendCard = bot.sendCard;
    bot.sendCard = this.sendCard;
    bot.origReply = bot.reply;
    bot.reply = this.reply;
    bot.origDm = bot.dm;
    bot.dm = this.dm;
    bot.origUploadStream = bot.uploadStream;
    bot.uploadStream = this.uploadStream;
    bot.origMessageStreamRoom = bot.messgeStreamRoom;
    bot.messageStreamRoom = this.messageStreamRoom;
    bot.origUpload = bot.upload;
    bot.upload = this.upload;

    this.bot = bot;
  };

  async onSpawn(addedByPerson) {
    let validUser = '';
    let betaModeState = {};
    let configIsInitialized;
    try {
      if (!this.betaMode) {
        this.logger.warning('Unneeded call to BetaMode.onSpawn() when not in beta mode');
        this.initConfig('');
        return when(true);
      }

      let botJustAdded = (addedByPerson) ? true : false;
      if ((botJustAdded) && (addedByPerson.id !== this.bot.person.id)) {
        let addedByEmail = _.toLower(addedByPerson.emails[0]);
        validUser = _.find(this.validUsers, userEmail => {
          return (addedByEmail === _.toLower(userEmail));
        });
        if (!validUser) {
          this.notifyOfNonBetaSpace()
            .then(() => {
              if (!this.bot.isDirect) {
                this.bot.exit();
                return when(false);
              }
            })
            .catch((e) => this.logger.error(`BetaMode:onSpawn unable to send non-GA message to space "${this.bot.room.title}": ${e.message}`));
        }
        // Set persistenet store with this new space's beta mode config
        configIsInitialized = this.initConfig(validUser);
      } else {
        // Check the users in this space to see if this bot should be active here
        // TODO Optimize by looking up the existing config and passing it into this method
        try {
          betaModeState = await this.bot.recall('betaModeState');
          if ((betaModeState.validUser) && (betaModeState.validUser)) {
            configIsInitialized = Promise.resolve(validUser);
            validUser = await this.validateBetaState(betaModeState);
            if (!validUser) {
              this.notifyOfNonBetaSpace()
                .then(() => {
                  if (!this.bot.isDirect) {
                    this.bot.exit();
                    return when(false);
                  }
                })
                .catch((e) => this.logger.error(`BetaMode:onSpawn unable to send non-GA message to space "${this.bot.room.title}": ${e.message}`));
              // Update persistenet store with this space's new beta mode config
              configIsInitialized = this.initConfig(validUser);
            }
          } else {
            configIsInitialized = Promise.resolve('');
            // This is an existing 1-1 space with a non beta user
            this.logger.verbose(`Found an existing space "${this.bot.room.title}" with non beta user.`);
            if (!this.bot.isDirect) {
              this.logger.warn(`Found an existing non-beta space "${this.bot.room.title} that is not 1-1!`);
            }
            // We COULD see if the user has been added to the list here
            // We COULD check to see if beta mode is now off and announce that we are ready to go
            validUser = await this.checkForValidUsers();
            if (validUser) {
              this.bot.origSay('I am now available and will respond to messages and button presses.')
                .catch((e) => {
                  this.logger.warn(`Unable to notify user in space ${this.bot.room.title}" `
                    `that bot is now availble:${e.message}`);
                });
            }
            // Update persistenet store with this space's new beta mode config
            // TODO tell user when beta mode is re-enabled
            configIsInitialized = this.initConfig(validUser);
          }
        } catch (e) {
          this.logger.warn(`Unable to find stored betaMode config for existing space ` +
            `"${this.bot.room.title}": ${e.message}\n Will recalculate...`);
          validUser = await this.checkForValidUsers();
          configIsInitialized = this.initConfig(validUser);
        }
      }
    } catch (e) {
      this.logger.error(`Failed to set up beta mode for bot spawned in room "${this.bot.room.title}`);
      this.betaMode = false;
      this.initConfig('');
      return when(true);
    }

    // Register a handlers for membership changes
    this.bot.on('memberEnters', async (bot, membership) => {
      try {
        let betaModeState = await bot.recall('betaModeState');
        if (!betaModeState.allowed) {
          //      if (!bot.betaModeConfig.allowed) {
          var foundUserEmail = _.find(this.validUsers, userEmail => {
            return (_.toLower(membership.personEmail) === _.toLower(userEmail));
          });
          if (foundUserEmail) {
            this.logger.info(`EFT User ${membership.personDisplayName} joined previously deactivated room ${bot.room.title}`);
            bot.origSay(`EFT User ${membership.personDisplayName} joined the spaces, so I am now active. Send me a "help" message to see what I can do!`)
              .catch((e) => this.logger.error(`Failed to notify space that bot is enabled while in beta mode: ${e.message}`));
            betaModeState.allowed = true;
            betaModeState.validUser = foundUserEmail;
            await bot.store('betaModeState', betaModeState);
          }
        }
      } catch (e) {
        this.logger.warn(`failed to process betaMode logic for memberEnters event: ${e.message}`);
      }
    });

    this.bot.on('memberExits', async (bot, membership) => {
      try {
        let betaModeState = await bot.recall('betaModeState');
        if ((betaModeState.allowed) &&
          (_.toLower(membership.personEmail) === betaModeState.validUser)) {
          this.logger.verbose(`${membership.personDisplayName} left ${bot.room.title}. ` +
            `Checking for other valid EFT users...`);
          let validUser = await this.checkForValidUsers();
          if (validUser) {
            betaModeState.validUser = validUser;
            await bot.store('betaModeState', betaModeState);
            this.logger.verbose(`Found another EFT user ${validUser} in room  ${bot.room.title}.`);
          } else {
            this.logger.verbose(`No other EFT users in in room ${bot.room.title}. Will deactiveate and leave space.`);
            bot.origSay('This bot is still in beta mode and no more authorized beta users are members of this space.  Leaving space')
              .then(() => bot.exit())
              .catch((e) => this.logger.error(`Failed to notify space that bot is exiting space while in beta mode: ${e.message}`));
          }
        }
      } catch (e) {
        this.logger.warn(`failed to process betaMode logic for memberExits event: ${e.message}`);
      }
    });

    return when(configIsInitialized);
  };

  async notifyOfNonBetaSpace(addedByEmail) {
    if (this.bot.isDirect) {
      this.logger.info(`Bot was added to a one-on-one space by non EFT user ${addedByEmail}.  Sending EFT Message.`);
      return this.bot.origSay('I am not yet generally available and will ignore all input until I am. I will message this space when I become available.');
    } else {
      this.logger.info(`Bot was added to a space "${this.bot.room.title}" by non EFT user ${addedByEmail}.  Leaving space.`);
      return this.bot.origSay('I am not yet generally available. Try adding me again later.');
    }
  }

  initConfig(validUser) {
    let betaModeState = {
      validUser: validUser,
      enabled: this.betaMode
    };
    if (this.betaMode) {
      betaModeState.allowed = (validUser) ? true : false;
    } else {
      betaModeState.allowed = false;
    }
    return this.bot.store('betaModeState', betaModeState)
      .then(() => validUser)
      .catch((e) => this.logger.error(`Failed saving initial betaMode state: ${e.message}`));
  }

  async validateBetaState(betaMode) {
    if (betaMode.validUser) {
      return this.bot.framework.webex.memberships.list({ roomId: this.bot.room.id })
        .then((memberships) => {
          var found = _.find(memberships.items, member => {
            return (betaMode.validUser === _.toLower(member.personEmail));
          });
          if (found) {
            this.logger.verbose(`Room "${this.bot.room.title}" has expected EFT user: ${betaMode.validUser}`);
            return when(betaMode.validUser);
          }
          this.logger.warn(`Missing expected EFT user ${betaMode.validUser} in Room "${this.bot.room.title}"`);
          return when('');
        })
        .catch((e) => {
          this.logger.error(`BetaMode:validateBetaState failed: ${e.message} will assume EFT user is there.`);
          return when(betaMode.validUser);
        });
    } else {
      return when('');
    }
  }

  async checkForValidUsers() {
    if (!this.validUsers.length) {
      return when('');
    }
    // TODO this could be optimized by seeing what the current state is
    // and if one exists validating that the beta user is still a member of the space
    // Ony if that isnt the case do we need to do the full walk done here..
    return this.bot.framework.webex.memberships.list({ roomId: this.bot.room.id })
      .then((memberships) => {
        for (let member of memberships.items) {
          let memberEmail = _.toLower(member.personEmail);
          if (memberEmail === _.toLower(this.bot.membership.personEmail)) { continue; }
          var found = _.find(this.validUsers, betaParticipant => {
            return (memberEmail === _.toLower(betaParticipant));
          });
          if (found) {
            this.logger.verbose(`Room "${this.bot.room.title}" has an EFT user: ${memberEmail}`);
            return when(memberEmail);
          }
        }
        this.logger.verbose(`No EFT Users in Room "${this.bot.room.title}"`);
        return when('');
      })
      .catch((e) => {
        this.logger.error(`BetaMode:checkForValidUsers failed: ${e.message}`);
        return when('');
      });
  };

  /*
   * betaMode functions for intercepting bot interactions with users
   */

  async say(format, message) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.say() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origSay(format, message);
    } else {
      logger.info(`BetaMode: Supressing message from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async sendCard(cardJson, fallbackText) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.sendCard() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origSendCard(cardJson, fallbackText);
    } else {
      logger.info(`BetaMode: Supressing card from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async reply(replyTo, message, format) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.reply() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origReply(replyTo, message, format);
    } else {
      logger.info(`BetaMode: Supressing reply from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async dm(person, format, message) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.dm() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origDm(person, format, message);
    } else {
      logger.info(`BetaMode: Supressing dm from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async uploadStream(filename, stream) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.uploadStream() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origUploadStream(filename, stream);
    } else {
      logger.info(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async messageStreamRoom(roomId, message) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.messageStreamRoom() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origMessageStreamRoom(roomId, message);
    } else {
      logger.info(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when({});
    }
  };

  async upload(filepath) {
    let betaModeState = { allowed: true };
    try {
      betaModeState = await this.recall('betaModeState');
    } catch (e) {
      logger.warn(`BetaMode.upload() error looking up betaMode state: ${e.message}. ` +
        'Will assume space is enabled');
    }
    if (betaModeState.allowed) {
      return this.origUpload(filepath);
    } else {
      logger.info(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when({});
    }
  };

};
module.exports = BetaMode;