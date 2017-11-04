'use strict'

var URL = require('url').Url;

const findService = require('./tools.js').findService
const debug = require('debug')('loopback:component:cas')

function loginGet(app, config, req, res, next, serviceUrl, service) {
  const renew = req.query['renew']

  // process pre-existing login
  if (req.accessToken && !renew) {
    app.models.AccessToken.createAccessTokenId(function(err, st_temp) {
      if (err) {
        let error = new Error(err)
        error.status = 500
        next(error)
        return
      }
      let st = "ST-" + st_temp  // "Service tickets MUST begin with the characters, ST-"
      let serviceTicket = {
        id: st,
        ttl: config.serviceTicketTTL,
        created: new Date(),
        userId: req.accessToken.userId,
        appId: service.id
      }
      app.models.AccessToken.create(serviceTicket, function(err, obj) {
        if (err) {
          let error = new Error('could not create service ticket for service ' + service.url + ': ' + err)
          error.status = 500
          next(error)
          return
        }
        debug('CAS* generate service ticket %s for %s', st, service.name)
        let redirection = new URL(serviceUrl)
        redirection.searchParams.set('ticket', st)
        return res.redirect(303, redirection.href)
      })
    })
  } else {
    // renew ?
    if (req.accessToken && renew) {
      eval('app.models.' + config.userModel).logout(req.accessToken.id,function(err) {
        let error = new Error(err || 'could not logout:' + req.accessToken.id)
        error.status = 500
        next(error)
        return
      })
    }
    // auth
    let encode = encodeURIComponent("https://" + app.get('host') + ":" + app.get('port') + "/cas/login?service=" + serviceUrl)
    return res.redirect(config.loginPage + "?redirect=" + encode)
  }
}

/* login */
module.exports = function (app, config, req, res, next) {
  let serviceUrl = req.query['service']
  let URLserviceUrl = new URL(serviceUrl)
  let URLorigin = URLserviceUrl.origin

  if (!serviceUrl) {
    return res.redirect(config.loginPage)
  }

  // validate service
  findService(app, serviceUrl, function(err, service) {
    if (err) {
      let error = new Error(err)
      error.status = 500
      next(error)
      return
    } else if (service === null) {
      let error = new Error('could not validate CAS service : ' + serviceUrl)
      error.status = 400
      next(error)
      return
    }

    if (req.method.toUpperCase() == 'GET') {
      loginGet(app, config, req, res, next, serviceUrl, service)
    } else {
      // POST auth protocol modification
      let encode = encodeURIComponent("https://" + app.get('host') + ":" + app.get('port') + "/cas/login?service=" + serviceUrl)
      res.redirect(config.loginPage + "?redirect=" + encode)
    }
  })
}
