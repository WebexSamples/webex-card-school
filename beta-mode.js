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
          if (this.bot.isDirect) {
            this.logger.info(`Bot was added to a one-on-one space by non EFT user ${addedByEmail}.  Sending EFT Message.`);
            this.bot.origSay('I am not yet generally available and will ignore all input until I am. I will message this space when I become available.')
              .catch((e) => this.logger.error(`BetaMode:onSpawn unable to send non-GA message to space "${this.bot.room.title}": ${e.message}`));
          } else {
            this.logger.info(`Bot was added to a space "${this.bot.room.title}" by non EFT user ${addedByEmail}.  Leaving space.`);
            this.bot.origSay('I am not yet generally available. Try adding me again later.')
              .catch((e) => this.logger.error(`BetaMode:onSpawn unable to send non-GA message to space "${this.bot.room.title}": ${e.message}`));
            this.bot.exit();
            return when(false);
          }
        }
      } else {
        // Check the users in this space to see if this bot should be active here
        validUser = await this.checkForValidUsers();
      }

      // TODO figure this out -- want to announce when beta mode is over in existing spaces, but only once!
      // If this bot did not have a stored betaModeConfig we assume this is the 
      // first time it was spawned.  If there are no valid users in the space,
      // send a one time message letting the user(s) know we aren't available yet
      // Ideally this should only happen once
      // if ((!("betaModeConfig" in this.bot)) && (this.betaMode) && (!validUser)) {
      //   // Comment this out until we are ready to carefully test it
      //   //bot.say('I am not yet generally available and will ignore all input until I am. I will message this space when I become available.');
      //   console.log('I would spam existing spaces here');
      // }

      // Check if this bot has prevously been in betaMode and now isn't
      // In this case we want to announce that the bot is available
      // Ideally this should only happen once
      // if ((!this.betaMode) && (this.bot.betaModeConfig) && (this.bot.betaModeConfig.enabled)) {
      //   // Comment this out until we are ready to carefully test it
      //   //bot.say('I am now available. Send me a "help" message to see what I can do');
      //   console.log('I would spam existing spaces here');
      // }
    } catch (e) {
      this.logger.error(`Failed to set up beta mode for bot spawned in room "${this.bot.room.title}`);
      this.betaMode = false;
      this.initConfig('');
      return when(true);
    }

    this.initConfig(validUser);

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
            this.logger.verbose(`EFT User ${membership.personDisplayName} joined previously deactivated room ${bot.room.title}`);
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
            this.logger.verbose(`No other EFT users in in room ${bot.room.title}. Will deactiveate `);
            bot.origSay('This bot is still in beta mode and no more authorized beta users are members of this space.  I will ignore input until I go GA')
              .catch((e) => this.logger.error(`Failed to notify space that bot is disabling while in beta mode: ${e.message}`));
            delete betaModeState.validUser;
            betaModeState.allowed = false;
            await bot.store('betaModeState', betaModeState);
          }
        }
      } catch (e) {
        this.logger.warn(`failed to process betaMode logic for memberExits event: ${e.message}`);
      }
    });

    return when(true);
  };

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
    this.bot.store('betaModeState', betaModeState)
      .catch((e) => this.logger.error(`Failed saving initial betaMode state: ${e.message}`));
  }

  async checkForValidUsers() {
    if (!this.validUsers.length) {
      return when('');
    }
    return this.bot.framework.webex.memberships.list({ roomId: this.bot.room.id })
      .then((memberships) => {
        for (let validUserEmail of this.validUsers) {
          var found = _.find(memberships.items, membership => {
            return (_.toLower(membership.personEmail) === _.toLower(validUserEmail));
          });
          if (found) {
            this.logger.verbose(`Room "${this.bot.room.title}" has an EFT user: ${validUserEmail}`);
            return when(validUserEmail);
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
      logger.verbose(`BetaMode: Supressing message from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing card from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing reply from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing dm from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
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
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when({});
    }
  };

};
module.exports = BetaMode;