/* Empty initial data. No course, account or device is bundled. */
(function () {
  const now=new Date(); now.setDate(now.getDate()-((now.getDay()+6)%7));
  const monday=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  window.BANKE_SEED={state:{version:1,semesterStart:monday,selectedWeek:1,rangeStart:960,rangeEnd:1440,events:[],completed:[],theme:'light'},pending:[]};
  window.BANKE_INITIAL_STATE=window.BANKE_SEED.state;
})();
