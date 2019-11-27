const winston = require("winston");

const level = process.env.LOG_LEVEL || 'debug';
var logger = {};
if (process.env.PAPERTRAIL) {
  //
  // Requiring `winston-papertrail` will expose
  // `winston.transports.Papertrail`
  //
  require('winston-papertrail').Papertrail;

  var winstonPapertrail = new winston.transports.Papertrail({
    host: process.env.PAPERTRAIL_HOST,
    port: process.env.PAPERTRAIL_PORT,
    level: level
  });
  
  winstonPapertrail.on('error', function(err) {
    // Handle, report, or silently ignore connection errors and failures
    console.error('Papertrail logger failed to intiatlize: '+err.message);
  });

  logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: level,
        timestamp: function () {
          return (new Date()).toISOString();
        }
      }),
      winstonPapertrail
    ]
  });
} else {
  logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: level,
        timestamp: function () {
          return (new Date()).toISOString();
        }
      })
    ]
  });      
}


module.exports = logger;