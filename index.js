const FileCookieStore = require('tough-cookie-filestore')
const _request = require('request')
const cheerio = require('cheerio')
const config = require('./config.json')
const fs = require('fs')
const slack = require('slack')

const cookiePath = 'cookie.json'

// File given to FileCookieStore must exist.
fs.appendFileSync(cookiePath, '', {mode: 0o600})
const jar = _request.jar(new FileCookieStore(cookiePath))
const request = _request.defaults({jar: jar})

request('https://splatoon.nintendo.net/', function (error, response, body) {
  if (error) {
    console.log(error)
    return
  }

  const $ = cheerio.load(body)
  const loginButton = $('.nnid-login-btn')
  console.log(loginButton.length)
  console.log(loginButton.attr('href'))
})
