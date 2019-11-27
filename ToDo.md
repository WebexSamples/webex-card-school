# The following tasks need to be completed before this app is broadly exposed:

## Lesson Creation
* [x] Generate a list of lessons for the "Pick a Lesson" button by reading all of the ./res/#-content.json files.
* [x] Generate complete cards that include the Lesson number, and the generated list from the lesson picker
* [x] Create an npm command to generate lessons so they don't get generated each time the server restarts
* [ ] Complete Readme that describes how to generate lesson content
* [x] Build a class for lesson specific Action.Submit buttons
* [ ] Create links for Show Source based on an environment variable

## Controlled rollout
* [ ]  Add logic to be "inoperative" if the space isn't populated by a set of known users when bot is spawaned
* [ ]  Change operate/inoperative status when memberships change
* [ ]  Add a persistent store for information about the bots
  * [ ]  Store operative/inopareative status
  * [ ]  Store current lesson

## Core functionality
* [ ]  Add logic to know the most recent card presented.  Respond to submit actions from other cards with a reply that only the most current card's input is processed.
* [x]  Set the threading-api feature toggle for this bot
* [ ]  Add a "syllabus" command, that lays out the lessons in text format and allows the user to specify the leson they want

## Metrics and Feedback
* [ ] Add logic for a lesson-feedback.json as the last lesson
* [ ] Write the following "metrics" data
  * [ ] Bot Added/Removed from Space
  * [ ] Action.Submit button pressed
  * [ ] Feedback Provided
* [ ] Write Add/Remove feedback to a space.  Perhaps create

## Lesson Content
* [ ] Show an Input Form
* [ ] Handling Attachments
* [ ] Best Practices for when a card is "expired"
* [ ] 