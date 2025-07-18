const express = require('express')
const fetch = require('node-fetch')
const jwt = require('jsonwebtoken')
const bodyParser = require('body-parser')
const app = express()
app.use(bodyParser.json())

let urls = {}
let stats = {}

let logToken = ''
let logTokenExpires = 0

async function getLogToken() {
  if (logToken && Date.now() < logTokenExpires) return logToken
  let reg = await fetch('http://20.244.56.144/evaluation-service/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      companyName: "student",
      clientID: "student123",
      clientSecret: "student123",
      ownerName: "student",
      ownerEmail: "student@email.com",
      rollNo: "22VE1A6636"
    })
  })
  await reg.json()
  let auth = await fetch('http://20.244.56.144/evaluation-service/auth', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      clientID: "student123",
      clientSecret: "student123"
    })
  })
  let data = await auth.json()
  logToken = data.access_token
  logTokenExpires = Date.now() + 1000 * 60 * 50
  return logToken
}

async function logEvent(stack, level, pkg, message) {
  let token = await getLogToken()
  await fetch('http://20.244.56.144/evaluation-service/logs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({stack, level, package: pkg, message})
  })
}

app.use(async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode < 400) {
      await logEvent('backend', 'info', 'route', req.method + ' ' + req.originalUrl)
    }
  })
  next()
})

app.post('/shorturls', async (req, res) => {
  let {url, shortcode} = req.body
  if (!url) {
    await logEvent('backend', 'error', 'controller', 'No url')
    return res.status(400).json({error: 'url required'})
  }
  if (!/^https?:\/\//.test(url)) {
    await logEvent('backend', 'error', 'controller', 'Invalid url')
    return res.status(400).json({error: 'invalid url'})
  }
  if (!shortcode) {
    shortcode = Math.random().toString(36).substring(2,8)
    while (urls[shortcode]) shortcode = Math.random().toString(36).substring(2,8)
  }
  if (urls[shortcode]) {
    await logEvent('backend', 'error', 'controller', 'Shortcode exists')
    return res.status(400).json({error: 'shortcode exists'})
  }
  let expires = Date.now() + 30*60*1000
  urls[shortcode] = {url, expires}
  stats[shortcode] = {visits:0}
  res.json({shortcode, expires})
})

app.get('/:shortcode', async (req, res) => {
  let code = req.params.shortcode
  let entry = urls[code]
  if (!entry) {
    await logEvent('backend', 'error', 'controller', 'Not found')
    return res.status(404).json({error: 'not found'})
  }
  if (Date.now() > entry.expires) {
    await logEvent('backend', 'error', 'controller', 'Expired')
    return res.status(400).json({error: 'expired'})
  }
  stats[code].visits++
  res.redirect(entry.url)
})

app.get('/shorturls/:shortcode', async (req, res) => {
  let code = req.params.shortcode
  if (!urls[code]) {
    await logEvent('backend', 'error', 'controller', 'Not found')
    return res.status(404).json({error: 'not found'})
  }
  res.json({shortcode: code, visits: stats[code].visits, expires: urls[code].expires})
})

app.use(async (err, req, res, next) => {
  await logEvent('backend', 'error', 'route', err.message)
  res.status(500).json({error: 'server error'})
})

app.listen(3000)