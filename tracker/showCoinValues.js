
const fs = require('fs');
const pad = require('pad');
const numeral = require('numeral');
const moment = require('moment');

const coinConfig = require('./coinConfig.js');
const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

const NPAD_SIZE = Number(process.env.NPAD_SIZE);
const npad = (number) => pad(NPAD_SIZE, numeral((number)).format('0,0'));
const npadBlank = (number) => pad(NPAD_SIZE + 5, numeral((number)).format('0,0'));
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
const oldPrice = (epoch, nbase, number) => moment(new Date(epoch)).tz('Asia/Seoul').format('HH:mm') + '   ' + npad(number) + ' (' + numeral((nbase - number) / nbase * 100).format('0.0')+'%)';
const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILENAME = process.env.CONFIG_FILENAME;

exports.attach = (nv) => buildAttach(nv);

function buildAttach(nv) {
    try {
        const cf = JSON.parse(fs.readFileSync(CONFIG + currency + '/' + CONFIG_FILENAME));
        return new coinConfig(CURRENCY)

            .addField('Now : ' + npad(nv.close),
                oldPrice(nv.closeLast1epoch, nv.close, nv.closeLast1) + '\n' +
                oldPrice(nv.closeLast2epoch, nv.close, nv.closeLast2) + '\n' +
                oldPrice(nv.closeLast3epoch, nv.close, nv.closeLast3) + '\n' +
                oldPrice(nv.closeLast4epoch, nv.close, nv.closeLast4) + '\n' +
                oldPrice(nv.closeLast5epoch, nv.close, nv.closeLast5)
                , false)
            .addField('Buy:     ' + npercent((nv.close - cf.buyPrice ) / nv.close), npadBlank(cf.buyPrice) )
            .addField('histo(avr) ' + npad(nv.histoAvr),
                ((nv.histoSign) ? '+/-' : '') + '  ' + numeral(cf.histoPercent * nv.close).format('0,0') + ' (' + npercent(cf.histoPercent) + ')')

            .addField('Sell:     ' + npercent((cf.sellPrice - nv.close) / nv.close), npadBlank(cf.sellPrice) + '\n' +
                'd,k(' + numeral(nv.dLast).format('0') + ',' + numeral(nv.kLast).format('0') + ':' +
                numeral(nv.dNow).format('0') + ',' + numeral(nv.kNow).format('0') + ')')
            .addField('Volume (avr/last)', numeral(nv.volume).format('0,0.0')  +
                '  (' + numeral(nv.volumeLast / nv.volumeAvr * 100).format('0,0') + '%)\n'  +
                numeral(nv.volumeAvr).format('0,0.0') + ' / ' + numeral(nv.volumeLast).format('0,0.0'))

            .addField('gapAllow ' + npercent(cf.gapAllowance), npadBlank(cf.gapAllowance * nv.close))
        ;
    } catch (e) {
        throw new Error(e);
    }
}

