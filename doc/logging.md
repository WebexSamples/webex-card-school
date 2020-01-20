# Logging

This application uses the [winston](https://www.npmjs.com/package/winston) logging package to provide granular logging from verbose to error only.

It also uses the [winston-papertrail](https://www.npmjs.com/package/winston-papertrail) package to optionally send logging to the [papertrail](https://www.papertrail.com/solution/cloud-logging/), a cloud logging solution that provides web based viewing, filtering and log based alerts.

## Changing the logging level
By default the application logs at the verbose level.  You can reduce the amount of output that it writes to the console by setting the environment variable LOG_LEVEL to one of the following:

* error 
* warn 
* info 
* verbose

## Output to papertrail

If you would like to take advantage of papertrail logging, first setup an account at www.papertrail.com.  Once your account is set up, add the following environment variables:

* PAPERTRAIL
* PAPERTRAIL_HOST - host provided by papertrail
* PAPERTRAIL_PORT - port provided by papertrail

## More Information

* [Main README for project](../README.md)
* [Running this project locally](./running.md)
* [How this app works](./overview.md)
* [Using Persistent Storage](./storage.md)
* [Creating your own lessons](./lessons.md)
* Limiting access to your bot with ["beta mode"](./beta-mode.md) 
* [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.

