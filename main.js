#!/usr/bin/env node

/*
  references:
    https://github.com/mhgbrown/twitter-bot-boilerplate
    https://dev.twitter.com/rest/reference/post/statuses/update
  TODO:
    do whole login flow
    prevent retweeting same stuff by logging if we've tweeted for today
    tweet "in order" so it's easier to scan the feed
*/

var Twitter = require('twitter');
var Opts = require('commander');
var https = require('https');
var truncate = require('lodash.truncate');

Opts.version('0.0.1')
  .option('-v, --verbose', 'Log some debug info to the console')
  .parse(process.argv);

// Initialize Twitter API keys
var twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

var options = {
    host: 'gab.ai',
    path: '/feed/popular/today',
    headers: {
        'Authorization': 'Bearer ' + process.env.GABAI_AUTH
    }
};

// Verify the credentials
twitterClient.get('/account/verify_credentials', function(error, data, response) {

  if(Opts.verbose) {
    console.info('verify_credentials: ' + JSON.stringify(data));
  }

});

function tweetGab(splitStatus, replyId) {
  var statusToTweet = splitStatus.shift();
  var params = {
    status: statusToTweet
  };

  if(!statusToTweet) {
    return;
  }

  if(replyId) {
    params.in_reply_to_status_id = replyId;
    statusToTweet = statusToTweet + '\n@gabai_tweets';
  }

  if(Opts.verbose) {
    console.info('about to tweet: ', params);
  }

  twitterClient.post('statuses/update', params,  function(error, tweet, response) {
    if(error) {
      console.error('[ERROR] tweetGab: ', error);
    }

    if(Opts.verbose) {
      console.info(statusToTweet);
    }

    tweetGab(splitStatus, tweet.id_str);
  });
}

function tweetGabs(gabs) {
  var gabToTweet = gabs.shift();

  if(!gabToTweet) {
    return;
  }

  var statusToTweet = gabToTweet.post.user.name + ' (#' + gabToTweet.post.user.username + '):\n' + gabToTweet.post.body.replace(/@/g, '#');

  var parts = [];
  var firstPart = truncate(statusToTweet, {
    'length': 140,
    'omission': '',
    'separator': /\s/
  });
  parts.push(firstPart);

  var restOfTweet = statusToTweet.substr(firstPart.length);
  while(restOfTweet.length) {
    var nextPart = truncate(restOfTweet, {
      'length': 126,
      'omission': '',
      'separator': /\s/
    });
    parts.push(nextPart);
    restOfTweet = restOfTweet.substr(nextPart.length);
  }

  if(Opts.verbose) {
    console.info(parts);
  }


  // just bein explicit with the args
  tweetGab(parts, undefined);
  setTimeout(function() {
    tweetGabs(gabs);
  }, 30 * 1000);
}

function getPopularAndTweet() {
  https.get(options, function(res) {

    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => rawData += chunk);
    res.on('end', () => {
      let parsedData = JSON.parse(rawData);
      tweetGabs(parsedData.data)

      if(Opts.verbose) {
        console.log('Got response: ', parsedData);
      }
    });

  }).on('error', function(e) {
    console.error('Error fetching data from gab.ai: ', e);
  });
}

getPopularAndTweet();
setInterval(getPopularAndTweet, 1000 * 60 * 60 * 24);

// Handle exit signals
process.on('SIGINT', function(){
  process.exit(1);
});

process.on('exit', function(){
  process.stdout.write('Exiting...');
});
