import express from 'express'
import rateLimit from 'express-rate-limit'
import TwitterApi, { TweetPublicMetricsV2 } from 'twitter-api-v2'
import { CronJob } from 'cron'
import db from 'quick.db'
import { readFileSync } from 'fs';


let configJSON: Record<string, any> = {}

if (!process.env.API_KEY) {
  configJSON = JSON.parse(readFileSync('./config.json').toString())
}

const config = {
  apiKey: process.env.API_KEY ? process.env.API_KEY : configJSON.bearerToken,
  port: process.env.PORT ? process.env.PORT : configJSON.port
}

const twitterClient = new TwitterApi(config.apiKey)
const roClient = twitterClient.readOnly

interface tweetData {
  id: string
  source: string
  text: string
  author: string
  authorUser: string
  publicMetrics: TweetPublicMetricsV2 | undefined,
  title: string,
  action: string,
  createdAt: string
}

function parseTwitterHeader(text: string) {
  let firstLine = text.split('\n')[0]

  let meta = firstLine.substring(0, firstLine.indexOf(':'))
  let metaSeparated =  meta.split(/ +/)

  return {
    action: metaSeparated[0],
    user: metaSeparated[1],
    title: firstLine.substring(firstLine.indexOf(':') + 1),
    raw: firstLine
  }
}

async function twitterSearch(str: string) {
  roClient.v2.search(str, {
    max_results: 100
  }).then(async res => {
    for (let i = 0; i < 1; i++) {
      await res.fetchNext()
    }
    
    let modifiedTweets: tweetData[] = []
    res.tweets.forEach(tweet => {
      let metadata = parseTwitterHeader(tweet.text)
      let tweetData: tweetData = {
        id: tweet.id,
        source: tweet.source ? tweet.source : 'unknown',
        text: tweet.text,
        author: tweet.author_id ? tweet.author_id : 'unknown',
        authorUser: metadata.user,
        title: metadata.title,
        action: metadata.action,
        publicMetrics: tweet.public_metrics,
        createdAt: tweet.created_at ? tweet.created_at : 'unknown'
      }
      if (!modifiedTweets.find(tData => tData.authorUser == tweetData.authorUser) || !tweetData.authorUser) {
        modifiedTweets.push(tweetData)
      }
    })
    console.log(modifiedTweets.length)
    db.set(`twitter_search_${str.replace(' ', '_')}`, modifiedTweets)
  })
}

let refreshTweetCache = new CronJob('0 */12 * * *', () => {
  twitterSearch('valorant giveaway')
}, null, true)

refreshTweetCache.start()

twitterSearch('valorant giveaway')

const app = express()

app.get('/twitter/val-giveaway', (req, res) => {
  res.send(db.get('twitter_search_valorant_giveaway'))
})

app.listen(config.port, () => {
  console.log('API server starting..')
})