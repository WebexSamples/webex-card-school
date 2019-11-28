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

  async onSpawn(addedById) {
    let validUser = '';
    try {
      if (!this.betaMode) {
        this.logger.warning('Unneeded call to BetaMode.onSpawn() when not in beta mode');
        this.initConfig('');
        return when(true);
      }

      let botJustAdded = (addedById) ? true : false;
      if ((botJustAdded) && (addedById !== this.bot.person.id)) {
        let addedByPerson = await this.bot.framework.webex.people.get(addedById);
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

      // If this bot did not have a stored betaModeConfig we assume this is the 
      // first time it was spawned.  If there are no valid users in the space,
      // send a one time message letting the user(s) know we aren't available yet
      // Ideally this should only happen once
      if ((!("betaModeConfig" in this.bot)) && (this.betaMode) && (!validUser)) {
        // Comment this out until we are ready to carefully test it
        //bot.say('I am not yet generally available and will ignore all input until I am. I will message this space when I become available.');
        console.log('I would spam existing spaces here');
      }

      // Check if this bot has prevously been in betaMode and now isn't
      // In this case we want to announce that the bot is available
      // Ideally this should only happen once
      if ((!this.betaMode) && (this.bot.betaModeConfig) && (this.bot.betaModeConfig.enabled)) {
        // Comment this out until we are ready to carefully test it
        //bot.say('I am now available. Send me a "help" message to see what I can do');
        console.log('I would spam existing spaces here');
      }
    } catch (e) {
      this.logger.error(`Failed to set up beta mode for bot spawned in room "${this.bot.room.title}`);
      this.betaMode = false;
      this.initConfig('');
      return when(true);
    }

    this.initConfig(validUser);

    // Register a handlers for membership changes
    this.bot.on('memberEnters', (bot, membership) => {
      if (!bot.betaModeConfig.allowed) {
        var foundUserEmail = _.find(this.validUsers, userEmail => {
          return (_.toLower(membership.personEmail) === _.toLower(userEmail));
        });
        if (foundUserEmail) {
          this.logger.verbose(`EFT User ${membership.personDisplayName} joined previously deactivated room ${bot.room.title}`);
          this.bot.betaModeConfig.allowed = true;
          this.bot.betaModeConfig.validUser = foundUserEmail;
          bot.origSay(`EFT User ${membership.personDisplayName} joined the spaces, so I am now active. Send me a "help" message to see what I can do!`)
            .catch((e) => this.logger.error(`Failed to notify space that bot is enabled while in beta mode: ${e.message}`));
        }
      }
    });

    this.bot.on('memberExits', async (bot, membership) => {
      if ((bot.betaModeConfig.allowed) && (membership.personEmail === this.bot.betaModeConfig.validUser)) {
        this.logger.verbose(`${membership.personDisplayName} left ${bot.room.title}.  Checking for other valid EFT users...`);
        let validUser = await this.checkForValidUsers();
        if (validUser) {
          this.bot.betaModeConfig.validUser = validUser;
          this.logger.verbose(`Found another EFT user ${membership.personDisplayName} in room  ${bot.room.title}.`);
        } else {
          this.logger.verbose(`No other EFT users in in room ${bot.room.title}. Will deactiveate `);
          this.bot.betaModeConfig.allowed = false;
          bot.origSay('This bot is still in beta mode and no more authorized beta users are members of this space.  I will ignore input until I go GA')
            .catch((e) => this.logger.error(`Failed to notify space that bot is disabling while in beta mode: ${e.message}`));
        }
      }
    });

  };

  initConfig(validUser) {
    if (!("betaModeConfig" in this.bot)) {
      this.bot.betaModeConfig = {};
    }
    this.bot.betaModeConfig.enabled = this.betaMode;
    this.bot.betaModeConfig.validUser = validUser;
    if (this.betaMode) {
      this.bot.betaModeConfig.allowed = (validUser) ? true : false;
    } else {
      this.bot.betaModeConfig.allowed = true;
    }
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

  say(format, message, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origSay(format, message);
    } else {
      logger.verbose(`BetaMode: Supressing message from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  sendCard(cardJson, fallbackText, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origSendCard(cardJson, fallbackText);
    } else {
      logger.verbose(`BetaMode: Supressing card from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  reply(replyTo, message, format, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origReply(replyTo, message, format);
    } else {
      logger.verbose(`BetaMode: Supressing reply from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  dm(person, format, message, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origDm(person, format, message);
    } else {
      logger.verbose(`BetaMode: Supressing dm from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  uploadStream(filename, stream, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origUploadStream(filename, stream);
    } else {
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  messageStreamRoom(roomId, message, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origMessageStreamRoom(roomId, message);
    } else {
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when(true);
    }
  };

  upload(filepath, overridBetaMode /* default false */) {
    if ((this.betaModeConfig.allowed) || (overridBetaMode === true)) {
      return this.origUpload(filepath);
    } else {
      logger.verbose(`BetaMode: Supressing uploadStream from bot in space "${this.room.title}"`);
      return when(true);
    }
  };






  //  // Check each member for a jira acount and leave the space
  // // (or invalidate the space for a one-on-on space)
  // // if we find a non jira user in the space with our bot
  // async function exitIfNonJiraUsers(bot, members) {
  //   botEmail = flint.email.toLocaleLowerCase();
  //   securityBotEmail = "spark-cisco-it-admin-bot@cisco.com";
  //   let userLookupPromises = [];
  //   for (let i = 0; i < members.length; i++) {
  //     memberEmail = members[i].personEmail.toLocaleLowerCase();
  //     // Don't check our bot or Cisco's security bot
  //     if ((memberEmail != botEmail) && (memberEmail != securityBotEmail)) {
  //       // See if we have previously looked up this user in Jira
  //       if ((bot.spaceInfo.validatedUsers) && (bot.spaceInfo.validatedUsers.includes(memberEmail))) {
  //         continue;
  //       }
  //       // Asyncronously check with Jira if this user has an account
  //       userLookupPromises.push(jira.lookupUser(memberEmail));
  //     }
  //   }
  //   if (userLookupPromises.length) {
  //     // We wait for all the lookups to complete
  //     try {
  //       let jiraUsers = await Promise.all(userLookupPromises);
  //       // Add the checked users to this spaces data so we can skip checking them on restarts
  //       if (!bot.spaceInfo.validatedUsers) { bot.spaceInfo.validatedUsers = []; }
  //       for (let i = 0; i < jiraUsers.length; i++) {
  //         bot.spaceInfo.validatedUsers.push(jiraUsers[i][0].emailAddress);
  //       }
  //       updateSpaceInfo(bot);
  //     } catch (err) {
  //       if (bot.isDirect) {
  //         logger.warn('Will not interact one-on-one with user ' + bot.room.title + ', ' + err.message);
  //         bot.isValidUser = false;
  //       } else {
  //         logger.warn('Leaving ' + bot.room.title + ', ' + err.message);
  //         bot.say(err.message + '  \nI am only permitted to work in spaces where all members have ' +
  //           'access to the Webex Platform Jira instance. ' +
  //           'If you think that IS the case for this space please contact ' + adminEmail +
  //           '.  \nGoodbye.');
  //         bot.state = 'idle';
  //         return bot.exit();
  //       }
  //     }
  //   } else {
  //     logger.verbose('Already checked all participants in space: ' + bot.room.title + ' for jira accounts');
  //   }
  //   return null;
  // }

  // // Walk the membership for a space and exit if any members are
  // // not jira users
  // function exitIfInvalidMembers(bot) {
  //   flint.webex.memberships.list({ roomId: bot.room.id }).then(members => {
  //     exitIfNonJiraUsers(bot, members.items);
  //   }).catch(err => {
  //     logger.error('Can\'t get membership for room ' + bot.room.title + ': ' + err.message);
  //     bot.say('Sorry, I can\'t figure out if I belong here or not.');
  //     return bot.exit();
  //   });
  // }

  // // Check if a single user is a non jira user and exit the space if so
  // function exitIfInvalidMember(bot, email) {
  //   // mimic the structure of a room membership array returned in the multi-user 
  //   // version of this function
  //   let userToCheck = [{ "personEmail": email }];
  //   exitIfNonJiraUsers(bot, userToCheck);
  // }

};
module.exports = BetaMode;