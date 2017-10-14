var format = require('string-format');
format.extend(String.prototype);

let pad = require('pad');
let numeral = require('numeral');
let roundTo = require('round-to');
// var replaceall = require("replaceall");

// date, time conversion
var moment = require('moment');

var MACD = require('technicalindicators').MACD;

// Stream Roller
var rollers = require('streamroller');
var stream = new rollers.RollingFileStream('./log/trend.log', 20000, 2);

// CONFIG
const ANALYZER = 'analyzer';
const ConfigWatch = require("config-watch");
const CONFIG_FILE = './config/trackerConfig.json';
let configWatch = new ConfigWatch(CONFIG_FILE);
let analyzer = configWatch.get(ANALYZER);
const histoCount  = 6;   // variable for ignoring if too small changes

const CURRENCY = configWatch.get('currency');

configWatch.on("change", (err, config) => {
    if (err) { throw err; }
    if (config.hasChanged(ANALYZER)) {
        analyzer = config.get(ANALYZER);
        const v= {
            sell : npad(analyzer.sellPrice),
            buy  : npad(analyzer.buyPrice),
            gap  : roundTo(analyzer.gapAllowance * 100,2),
            histogram: numeral(analyzer.histogram).format('0,0')
        };
        const f = 'Sell:{sell}, hist:{histogram}\nBuy :{buy}, gap:{gap}\%';
        note.info(f.format(v), '*Config Change*');
    }
});

// LOGGER
let log4js = require('log4js');
let logger = log4js.getLogger('analyzer ' + CURRENCY);

let npad = (number) => pad(9, numeral((number)).format('0,0'));

let note = require('./notifier.js');

let TradeType = require('./tradeType.js');

let isFirstTime = true; // inform current setting when this module is started

var ohlcBuilder = require('./ohlcBuilder.js');
ohlcBuilder.getEmitter().on('event', listener);


function listener(ohlcs) {

    // ohlcs  = 
    // [
    //     {epoch, price, volume, date, high, low, close, open},
    //     {epoch, price, volume, date, high, low, close, open}
    // ]
    const closes = ohlcs.map(_ => _.close);

    var macdInput = {
        values            : closes,
        fastPeriod        : 12,
        slowPeriod        : 26,
        signalPeriod      : 9 ,
        SimpleMAOscillator: false,
        SimpleMASignal    : false
    };

    var macds = MACD.calculate(macdInput);
    var tradeType = '';
    var msgText = '';

    let tableSize = macds.length;
    if (isFirstTime) {
        const v= {
            sell : npad(analyzer.sellPrice),
            buy  : npad(analyzer.buyPrice),
            size : tableSize,
            gap  : roundTo(analyzer.gapAllowance * 100,2),
            now  : npad(ohlcs[ohlcs.length-1].close),
            histogram : analyzer.histogram
        };
        const f = 'Sell:{sell}, tblSz:{size}\n' +
            'Buy :{buy}, hist:{histogram}\n' +
            'Now :{now}, gap:{gap}\%' +
            '';
        note.info(f.format(v), '*_STARTED_*');
        isFirstTime = false;
        
    }
    if (tableSize < histoCount) {
        return;
    }
 
    var nowValues = ohlcs[ohlcs.length - 1];
    nowValues.MACD = macds[tableSize - 1].MACD;
    nowValues.signal = macds[tableSize - 1].signal;
    nowValues.histogram = macds[tableSize - 1].histogram;
    
    nowValues.histoAvr = roundTo((macds.slice(tableSize - histoCount).map(_ => _.histogram).reduce((e1, e2) => e1 + Math.abs(e2)))/histoCount,0);
    
    if (nowValues.histoAvr > analyzer.histogram) {
        var nowHistogram = nowValues.histogram;
        var lastHistogram = macds[tableSize - 2].histogram;
        if (lastHistogram >= 0 && nowHistogram <= 0 && 
            (Math.abs(analyzer.sellPrice - nowValues.close) / nowValues.close) < analyzer.gapAllowance) {
            tradeType = TradeType.SELL;
            msgText = (nowValues.close >= analyzer.sellPrice) ? '*Over, Should SELL*' : '*SELL POINT*';
        }
        else if (lastHistogram <= 0 && nowHistogram >= 0 &&
            (Math.abs(analyzer.buyPrice - nowValues.close) / nowValues.close) < analyzer.gapAllowance) {
            tradeType = TradeType.BUY;          // tradeType is blank...why?
            msgText = (nowValues.close <= analyzer.buyPrice) ? '*Under, Should BUY*' : '*BUY POINT*';
        }
        if (msgText) {  // tradeType is not used because 
            informTrade(nowValues, tradeType, msgText);
        }
    }
    else {
        logger.debug('last histogram [' + histoCount + '] average '  +  nowValues.histoAvr  + ' is smaller than ' + analyzer.histogram);
    }
    if (!msgText) {
        if (nowValues.close > analyzer.sellPrice) {
            msgText = 'Going UP UP';
            informTrade(nowValues, TradeType.SELL, msgText);
        } 
        else if (nowValues.close < analyzer.buyPrice) {
            msgText = 'Going DOWN';
            informTrade(nowValues, TradeType.BUY, msgText);
        }
    }
    keepLog(nowValues, tradeType, msgText);
}

function informTrade(nowValues, tradeType, msgText) {
    const now = nowValues.close;
    const target = ( tradeType == TradeType.SELL) ? analyzer.sellPrice : analyzer.buyPrice;
    const v= {
        nowNpad     : npad(now),
        buysell     : tradeType,
        targetNpad  : npad(target),
        gap         : npad(now - target),
        volume      : numeral(nowValues.volume).format('0,0.00'),
        hist        : numeral(nowValues.histogram).format('0,0.00'),
        histoAvr    : numeral(nowValues.histoAvr).format('0,0.00')
    };
    const f = 'Now :{nowNpad} vol:{volume}\n' +
        '{buysell}:{targetNpad} gap:{gap}\n' +
        'hist:{hist} avr:{histoAvr}';

    note.danger(f.format(v), msgText);
}

function keepLog(nowValues, tradetype, msgText) {

    try {
        let str = [
            moment(new Date(nowValues.epoch)).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm'),
            nowValues.open, 
            nowValues.high, 
            nowValues.low, 
            nowValues.close,
            roundTo(nowValues.volume,2),
            roundTo(nowValues.MACD,2),
            roundTo(nowValues.signal,2),
            roundTo(nowValues.histogram,2),
            roundTo(nowValues.histoAvr,2),
            tradetype,
            msgText
        ].join(', ');
        stream.write(str + require('os').EOL);
    } catch(exception) {
        logger.error('[trend log] ' + exception);
    }
}
