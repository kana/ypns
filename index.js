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

function visitTopPage() {
  request('https://splatoon.nintendo.net/', function (error, response, body) {
    if (error) {
      console.log(error)
      return
    }

    const $ = cheerio.load(body)
    const loginButton = $('.nnid-login-btn')
    if (loginButton.length) {
      visitLoginPage()
    } else {
      crawlOnlineFriendList($)
    }
  })
}

function visitLoginPage() {
  request('https://splatoon.nintendo.net/users/auth/nintendo', function (error, response, body) {
    if (error) {
      console.log(error)
      return
    }

    const $ = cheerio.load(body)
    const form = $('input[value="https://splatoon.nintendo.net/users/auth/nintendo/callback"]').closest('form')
    if (form.length) {
      tryLogin(form)
    } else {
      console.log('Error: Something wrong on log-in page')
    }
  })
}

function tryLogin(form) {
  console.log('TODO')
}

function crawlOnlineFriendList($) {
  console.log('TODO')
}

visitTopPage()
