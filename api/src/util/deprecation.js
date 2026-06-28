'use strict';

function deprecationHeader(reply, date, link) {
  reply.header('Deprecation', date);
  if (link) reply.header('Link', `<${link}>; rel="deprecation"`);
  reply.header('Sunset', date);
}

module.exports = { deprecationHeader };
