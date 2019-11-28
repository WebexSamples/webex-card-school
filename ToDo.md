# The following tasks need to be completed before this app is broadly exposed:

## Lesson Creation
* [x] Generate a list of lessons for the "Pick a Lesson" button by reading all of the ./res/#-content.json files.
* [x] Generate complete cards that include the Lesson number, and the generated list from the lesson picker
* [x] Create an npm command to generate lessons so they don't get generated each time the server restarts
* [ ] Complete Readme that describes how to generate lesson content
* [x] Build a class for lesson specific Action.Submit buttons
* [ ] Create links for Show Source based on an environment variable

## Controlled rollout
* [x]  Add logic to be "inoperative" if the space isn't populated by a set of known users when bot is spawaned
* [x]  Change operate/inoperative status when memberships change
* [x] Exit group spaces when a non EFT user added us regardless of other members  
* [ ]  Add a persistent store for information about the bots
  * [ ]  Store operative/inopareative status
  * [ ]  Store current lesson

## Core functionality
* [ ]  Add logic to know the most recent card presented.  Respond to submit actions from other cards with a reply that only the most current card's input is processed.
* [x]  Set the threading-api feature toggle for this bot
* [ ]  Add a "syllabus" command, that lays out the lessons in text format and allows the user to specify the leson they want

## Metrics and Feedback
* [x] Add logic for a lesson-feedback.json as the last lesson
* [ ] Write the following "metrics" data
  * [ ] Bot Added/Removed from Space
  * [ ] Action.Submit button pressed
  * [ ] Command entered
  * [ ] Feedback Provided
  * [ ] Figure out how to best index this data so that we can run queries such as:
  * [ ] How many spaces is our bot in
  * [ ] How many users have interacted with our bot (ever, this week)
  * [ ] How many users got to the graduation card
  * [ ] How many users interacted with more than X lessons
* [ ] Write Add/Remove feedback to a space.  Perhaps create an AdminRoomId instead of AdminEmail for group control

## Lesson Content
* [ ] Show an Input Form
* [ ] Handling Attachments
* [ ] Best Practices for when a card is "expired"

## Persistent store
Create a new module for storing config data to a DB
Try to use existing memory store conventions, but reads should not be async.
Research mongo to see if its better to update a single field in a dictionary or 
* [x] on spawn get storeConfig from database and attach to bot
* [x] on bot.store, write to local copy, lazy return from database write with error messages for DB write fails
* [x] on bot.recall read syncronously from local copy
* [x] on bot.forget, update db lazily

## Framework improvements
* [ ] reimplment beta-mode as a core frameowrk feature