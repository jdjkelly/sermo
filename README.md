# Sermo

Sermo is an email agent.

> c. 1200, sermoun, sarmun, "a discourse upon a text of scripture; that which is preached," from Anglo-French sermoun, Old French sermon, sermun "speech, words, discourse; church sermon, homily" (10c.) and directly from Latin sermonem (nominative sermo) "continued speech, conversation; common talk, rumor; learned talk, discourse; manner of speaking, literary style."

It:
- Reads emails
- Manages an inbox
  - Removes emails from the main inbox unless they are from real humans or are directly actionable
  - Notifies you of a ready draft reply
- Manages relationships
  - Keeps track of who you know and who you don't
  - Keeps track of what you know about them
  - Can build a summary of all of the correspondence you've had with someone
- Drafts emails
  - Schedules times to meet
  - Future replies
- Acts as a calendar assistant
  - It can automatically offer times to meeting

Technically:
  - Has an MCP server
  - Has a CLI
  - Supports any model including locally
  - Stores emails in a local sqlite database
  - In the future will have a local app
  - Works with IMAP Gmail accounts
