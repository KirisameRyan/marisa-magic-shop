'use strict';
const copy=require('../../js/gensokyo-release.js');
function startsAt(){const raw=process.env.MMS_INCIDENT_START_AT;if(!raw)return 0;const value=Date.parse(raw);return Number.isFinite(value)?value:Infinity;}
function enabled(time=Date.now()){return process.env.MMS_INCIDENT==='1'&&time>=startsAt();}
function status(s,time=Date.now()){return {known:true,startsAt:startsAt()||copy.START_AT,active:!!s.incident&&s.incident.phase!=='resolved'&&enabled(time),phase:s.incident?.phase||null};}
function notice(s,time=Date.now()){return copy.notice(time,status(s,time));}
module.exports={startsAt,enabled,status,notice};
