/*
 * mogo.js
 * 
 * This module implments a storage interface for bots built using
 * the webex-node-botkit-framework.  Data is stored in a mongo
 * database, but also stored locally in the bot object for fast
 * syncronous lookups.  Writes lazily update the database
 * 
 * TODO Look at adding this officially to the framework itself
 */
const when = require('when');

// promisfy JSON.parse and JSON.stringify
const jsonParse = when.lift(JSON.parse);
const jsonStringify = when.lift(JSON.stringify);

var mongo_client = require('mongodb').MongoClient;
var mConfig = {};
if ((process.env.MONGO_USER) && (process.env.MONGO_PW) &&
  (process.env.MONGO_URL) && (process.env.MONGO_DB)) {
  mConfig.mongoUser = process.env.MONGO_USER;
  mConfig.mongoPass = process.env.MONGO_PW;
  mConfig.mongoUrl = process.env.MONGO_URL;
  mConfig.mongoDb = process.env.MONGO_DB;
}
// TODO figure out where/when this should be specified.  Hard coded here aint good
var mongo_collection_name = "cardSchoolDevStorage";
var mongoUri = 'mongodb://' + mConfig.mongoUser + ':' + mConfig.mongoPass + '@' + mConfig.mongoUrl + mConfig.mongoDb + '?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';

class MongoStore {
  constructor(logger, defaultConfig) {
    this.mCollection = {};
    this.logger = logger;
    this.defaultConfig = defaultConfig;
    // TODO -- latest mongo version syntax has changed.   Figure out how/if to upgrade
    mongo_client.connect(mongoUri)
      .then((db) => db.collection(mongo_collection_name))
      .then((collection) => {
        this.mCollection = collection;
      })
      .catch((e) => console.error('Error connecting to Mongo ' + e.message));
  }

  /**
   * Read or create store data when a bot is first spawned
   *
   * This method is exposed as bot.store(key, value);
   *
   * @function
   * @param {object} bot - bot that is storing the data
   * @param {boolean} frameworkInitialized - false during framework startup
   * @param {(String|Number|Boolean|Array|Object)} value - Value of key
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
   */
  async onSpawn(bot, frameworkInitialized) {
    let spaceId = bot.room.id;
    let spaceName = bot.room.title;
    if (this.mCollection) {
      if (!frameworkInitialized) {
        // Look for an existing storeConfig in the DB
        return this.mCollection.findOne({ '_id': spaceId })
          .then((reply) => {
            if (reply !== null) {
              this.logger.verbose(`Found storeConfig for existing space: "${spaceName}"`);
              bot.storeConfig = reply;
              return when(reply);
            } else {
              this.logger.warn(`Did not find storeConfig for existing space: "${spaceName}", will create one`);
              return this.createDefaultConfig(bot);
            }
          })
          .catch((e) => {
            this.logger.error(`Failed to contact DB on bot spawn for space "${spaceName}": ${e.message}.  Using default config`);
            return this.createDefaultConfig(bot);
          });
      } else {
        // Start with the default config when our bot is added to a new space
        return this.createDefaultConfig(bot);
      }
    } else {
      this.logger.warn(`No DB will use default config for "${spaceName}".  Settings will not persist across restarts.`);
      bot.storeConfig = this.defaultConfig;
      return when(this.defaultConfig);
    }
  };

  createDefaultConfig(bot) {
    let defaultConfig = JSON.parse(JSON.stringify(this.defaultConfig));
    defaultConfig._id = bot.room.id;
    bot.storeConfig = defaultConfig;
    return this.mCollection.update(defaultConfig, {upsert: true, w: 1 })
      .catch((e) => {
        this.logger.error(`Failed to store default config for space "${bot.room.title}": ${e.message}`);
        return when(defaultConfig);
      });
  };

  /**
   * Store key/value data.
   *
   * This method is exposed as mongoStore.store(bot, key, value);
   *
   * @function
   * @param {object} bot - bot that is storing the data
   * @param {String} key - Key under id object
   * @param {(String|Number|Boolean|Array|Object)} value - Value of key
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
   */
  store(bot, key, value) {
    if ((!bot) || (!('storeConfig' in bot))) {
      let msg = `Failed to store {${key}: ${value}}.  Invalid bot object.`;
      this.logger.error(msg);
      return when.reject(new Error(msg));
    }
    if (key) {
      if ((typeof value === 'number') || (value)) {
        bot.storeConfig[key] = value;
      } else {
        bot.storeConfig[key] = '';
      }
      return this.mCollection.updateOne(
        { _id: bot.storeConfig._id },bot.storeConfig, { upsert: true,  w: 1 })
        .catch((e) => {
          this.logger.error(`Failed DB storeConfig update "${bot.room.title}": ${e.message}`);
          return when(bot.storeConfig);
        });
    }
    return when.reject(new Error('invalid args'));
  };

  /**
 * Recall value of data stored by 'key'.
 *
 * This method is exposed as mongoStore.recall(bot, key);
 * It returns syncronously and does not return a promise.
 *
 * @function
 * @param {Object} bot - Bot to get key for
 * @param {String} [key] - Key under id object (optional). If key is not passed, all keys for id are returned as an object.
 * @returns {(String|Number|Boolean|Array|Object)}
 */
  recall(bot, key) {
    if ((typeof bot !== 'object') || (!('storeConfig' in bot))) {
      let msg = `Failed to store {${key}: ${value}}.  Invalid bot object.`;
      this.logger.error(msg);
      return null;
    }
    if (key) {
      if (key in bot.storeConfig) {
        return (bot.storeConfig[key]);
      } else {
        this.logger.warn(`Failed to find ${key} in recall() for space "${bot.room.title}"`);
        return null;
      }
    } else {
      return bot.storeConfig;
    }
  };

  /**
   * Forget a key or entire store.
   *
   * This method is exposed as mongoStore.forget(bot, key);
   *
   * @function
   * @param {Object} bot - Bot to remove key from
   * @param {String} [key] - Key to forget (optional). If key is not passed, all stored configs are removed.
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
   */
  forget(bot, key) {
    if ((!bot) || (!('storeConfig' in bot))) {
      let msg = `Failed to forget ${key}.  Invalid bot object.`;
      this.logger.error(msg);
      return when.reject(new Error(msg));
    }
    if (key) {
      if (key in bot.storeConfig) {
        delete bot.storeConfig[key];
      } else {
        this.logger.warn(`Failed to find ${key} in forget() for space "${bot.room.title}"`);
        return when(null);
      }
    } else {
      bot.storeConfig = {};
      bot.storeConfig._id = bot.room.id;
    }
    return this.mCollection.updateOne(
      { _id: bot.storeConfig._id },bot.storeConfig, { upsert: true,  w: 1 })
      .catch((e) => {
        this.logger.error(`Failed DB storeConfig update "${bot.room.title}": ${e.message}`);
        return when(bot.storeConfig);
      });
  };
};

module.exports = MongoStore;
