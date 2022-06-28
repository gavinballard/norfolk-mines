/**
 * Welcome to Cloudflare Workers! This is your first scheduled worker.
 *
 * - Run `wrangler dev --local` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/mf/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in wrangler.toml (see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers)
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

import { parse } from 'node-html-parser';
const parseSetCookie = require('set-cookie-parser');

export default {
  async scheduled(controller, env, ctx) {

    const getResponse = await fetch('http://nsccc.org.au/buyselldays/', {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
      }
    });

    const getHeaders = getResponse.headers.get('set-cookie');
    const cookie = parseSetCookie(getHeaders, { map: true });

    const postResponse = await fetch('http://nsccc.org.au/buyselldays/login/action/', {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `PHPSESSID=${cookie['PHPSESSID'].value}`
      },
      body: `user_name=${env.NSCC_USERNAME}&user_password=${env.NSCC_PASSWORD}`
    });

    const postHtml = await postResponse.text();
    const parsedHtml = parse(postHtml);

    const buyLinks = parsedHtml.querySelectorAll('a[href^="http://nsccc.org.au/buyselldays/buy/form/"]');

    buyLinks.forEach(async buyLink => {
      const tr = buyLink.parentNode.parentNode;
      const tds = tr.querySelectorAll('td');

      const date = tds[0].innerText;
      const room = tds[2].innerText;
      const link = buyLink.attributes.href;

      if(room !== env.ROOM) {
        return;
      }

      const existingDate = await env.KV.get(link);

      if(existingDate) {
        return;
      }

      // trigger the sms workflow
      await fetch(env.TWILIO_FLOW_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `To=${env.NUMBER_TO}&From=${env.NUMBER_FROM}&Parameters={"room":"${room}","date":"${date}","link":"http://nsccc.org.au/buyselldays/"}`
      });

      // record that we have triggered this
      await env.KV.put(link, date);
    });

  },
};
