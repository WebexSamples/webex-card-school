# Using Persistent Storage

This application can take advantage of the mongo persistent storage modules that can optionally be used with the [webex-node-bot-framework](https://github.com/webex/webex-bot-node-framework) to maintain data sent to the `bot.store()` method across server restarts.   This is useful, as an example, to remember what the messageId of the current lesson is in order to "ignore" button pushes to older lessons.

This app also uses the framework's bot.writeMetric() method which is available only when the framework is configured with a persistent memory store driver. Metrics data can be consumed by downstream processes to measure engagement with your application, or perform operational tasks.

The persistent storage driver is only used if configured to do so.  By default, the framework's non persistent memory storage driver is used.  When run in this mode there may be warnings and errors sent to the terminal that indicate that the application was unable to `bot.recall()` certain data, especially after a restart, or unable to complete a call to `bot.writeMetric()`. The basic functionality of the app will work however, and these errors can safely be ignored when running the application in development mode.

Developers who wish to use this project as a template for their own production level applications may choose to use this storage driver with their own mongo databases, or should edit the code appropriately to not rely on persistent storage or write metrics data using `bot.writeMetric()`

For users who prefer a different persistent store, the framework provides a template for [adding your own storage driver](https://github.com/webex/webex-bot-node-framework/tree/master/storage).

# Configuring the app to use the Mongo storage driver
Configure a mongo database accessible via URL.   If you are unfamiliar with Mongo start [here](https://www.mongodb.com/cloud/atlas).

The initialization logic in [server.js](../server.js), checks to see if an environment variable `MONGO_URI` is set and if so it attempts to connect to the database.   

More details on Mongo connect URLs can be found [here](https://docs.mongodb.com/manual/reference/connection-string)

The following environment variables can optionally be set to further configure the storage:


* MONGO_BOT_STORE -- name of collection for bot storage elements (will be created if does not exist).  Will use "webexBotFramworkStorage" if not set
* MONGO_BOT_METRICS -- name of a collection to write bot metrics to (will be created if does not exist). bot.writeMetric() calls will fail if not set
* MONGO_INIT_STORAGE -- stringified object assigned as the default startup config if none exists yet
* MONGO_SINGLE_INSTANCE_MODE -- Optimize lookups speeds when only a single bot server instance is running


## More Information

* [Main README for project](../README.md)
* [Running this project locally](./running.md)
* [How this app works](./overview.md)
* [Creating your own lessons](./lessons.md)
* [Advanced Logging](./logging.md)
* Limiting access to your bot with ["beta mode"](./beta-mode.md) 
* [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.
