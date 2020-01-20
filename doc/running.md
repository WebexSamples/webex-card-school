# Running this project locally
Developers are encouraged to fork this project and run it locally to better understand how it works, and potentially use it as a framework for creating their own bots.

As described in [How This App Works](./overview.md), this application's runtime logic is somewhat decoupled from the content of the "lessons" themselves, and developers who wish to create their own cards based apps may be able to re-purpose much of this project's runtime code and simply [create their own cards](./lessons.md).

## Checklist to run your own bot (absolute bare minimum to get a local cardSchool bot working)

Prerequisites:

- [ ] node.js (minimum supported v10.15.3)
- [ ] a Webex Teams account
- [ ] a public IP address (or a tool like ngrok)

----
- [ ] Download this project as a zip file via the green "Clone or download" button (or if you are familiar with git, fork this repo and run `git clone` with the url to download your forked copy).

- [ ] Optionally, sign up for nGrok (save API key) and start it on your machine (save the port number and public web address): https://ngrok.com/download.  This step is not needed if you are able to run the project locally on a machine with a public IP address.

- [ ] Create a Webex Teams Bot (save the email address and API key): https://developer.webex.com/add-bot.html

- [ ] In the directory where you downloaded this project, download the dependencies by typing `npm install` 

## Configure the environment to build the lessons
The lessons are generated based on static lesson conent and some environment data about where the application is running.   This process is described in greater detail in the [Creating your own lessons](.doc/lessons.md) readme file.

The minimal configuration needed to build the cards is information about where your server is running.   Create or edit a file called `.env` and set an environment variable called `IMAGE_HOSTING_URL` to the public IP address where your application will run.  For example if you are using ngrok your .env file might have a line like this:

* IMAGE_HOSTING_URL="http://[XXXXXX].ngrok.io/images"

## Building the lesson cards
After your image hosting url environment variable is set, run the following command from a terminal window in the directory where your project is:

`npm run build`

This will create a set of lesson cards in the `generated` directory of your project that will reference images hosted by your server.

You may see some warnings printed out saying that the build program was not able to find other expected environemnt variables. By default the cards will point back to the app and card source of this project on github.   If you go on to use this project to build your own application you will want to either remove these links from your cards, or update the environment to point to your own project.   This is described in more detail in the [Creating your own lessons](.doc/lessons.md) readme file.


## Configure the server environment
Once your cards are built you are ready to start your application server.  This process also requires some environment variables to be set.

Edit your `.env` file again and add the following environmnt varibles:

* TOKEN - the token that you got when you created your bot at https://developer.webex.com/add-bot.html
* PORT - the port where your app is running.  This is typically needed when running locally with ngrok, and set automatically when running in a production environemnt.

## Starting the server

Start your node server in your enviornment.  This can be done via a debugger when running locally or by entering the following:

`npm start`

(Alternately, you can run the server in a debugger.  For example if this project is loaded into Visual Studio, hit F5 to start the debugger).

You may see some warnings and errors in the console window.  In a production environment, this bot is configured to leverage a persistent data store which saves information about the bot's state across restarts, and is used to write metrics data on its usage.   These errors and warnings are useful to the operational team monitoring the production instance of this application, but can be safely ignored when running locally for the purposes of understanding how this application works.

To learn more about how this app uses persistent storage see [How this app works](./doc/overview.md)

## Using the bot

Once the server is up and running Webex Teams users can add the bot to a teams space.  When first added to a space, the bot should print out a help message, and post the Introduction lesson card.   User's can then interact with the bot by clicking on the navigation buttons to move from lesson to lesson.

Most interaction takes place via buttons and cards but the bot does support a few text commands:
* *help* - will present this message again
* *lesson X* - show card for a lesson, X is a digit: 0 - 15
* *start over* - will bring up the first lesson

Any other text input will re-render the current lesson card.  Don't forget to at-mention the bot by name in a group space.

Problems? Feel free to ask for help in the [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.

## Getting feedback in Webex Teams

The server can be configured to post information to a specified Webex Teams space when the following activities occur:

* The bot is added to a space
* The bot is removed from a space
* A user submits feedback via the bot

There are two environment variables that can be used  to configure an "Admin" or "Feedback" space:

* ADMIN_EMAIL - the email of a user.  If this is set the bot will create a 1-1 space with this user and post the feedback there.
* METRICS_ROOM_ID - id of the space to post the messages to.  If this is set, the bot must be made a member of this space.  The advantage of using this method is that multiple "administrors" can track the activity of your bot via Webex Teams.  

If both environment variables are set ADMIN_EMAIL will be ignored.

## More Information

* [Main README for project](../README.md)
* [How this app works](.doc/overview.md)
* [Creating your own lessons](.doc/lessons.md)
* [Using Persistent Storage](./storage.md)
* [Advanced Logging](./logging.md)
* Limiting access to your bot with ["beta mode"](./beta-mode.md) 
* [Ask Buttons and Cards School](https://eurl.io/#SJiS9VKTH) Webex Teams space.
