# Beta Mode

The first step in creating a bot for Webex Teams is navigating to the [Webex Developer's Portal](https://developer.webex.com/add-bot.html) and declaring a unique bot name and email address for your bot.

Once this is done, anyone who discovers the email address of your bot can add it to their spaces.  If your application is running and has registered for Webex Team's events, it will begin communicating with any users in those spaces.

Sometimes, especially during development, this is not desirable, and in fact you'd prefer to let users know that your bot isn't ready for prime time (or simply not available to them) yet.

Developers who use this project as the basis for their own bots can use the beta mode feature to limit usage of the bot only to a known set of users.  This feature was developed in conjunction with this application and is still somewhat "experimental".  Over time we anticiapte that it will move into the core [webex-node-bot-framework](https://github.com/webex/webex-bot-node-framework), and may add additional bells and whistles such as customized non-avaiablity messages and/or domain based availability restrictions.

## Limiting the universe of users who can use your bot
If you'd like to set up a group of "beta users" who are the only ones who can access your bot's functionality simply create an environment variable with a list of email addresses that match their Webex Team's account: ie:

BETA_USER_EMAILS = "user1@domain.org, user2@otherdomain.org"

When this enironment varible is set, the bot spawning logic will check to see if the user who added the bot is in the beta user list.

If not, and the space is a group space, the bot will inform users that it is not generally avaiable and leave the space.  Its worth noting that not every member of a group space needs to be on the BETA_USER list, just the user who added them.  This gives beta users the ability to share the bot with others if they wish.

 If the bot was added to a one-on-one space, the bot will tell the user that they will ignore any further input.

## Feedback wanted!
Do you find beta mode helpful?  Are there aspects of it that you would like to change?   Leae a github issue or come to us in the [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.

## More Information

* [Main README for project](../README.md)
* [Running this project locally](.doc/running.md)
* [How this app works](.doc/overview.md)
* [Creating your own lessons](.doc/lessons.md)
* [Using Persistent Storage](./storage.md)
* [Advanced Logging](./logging.md)
* [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.



