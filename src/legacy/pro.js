/* ===== RFTM PRO · Predicciones, Comentarista IA, Simulador y Wrapped ===== */
(function(){
  var DB=function(k,fb){ var v=window.__DB&&window.__DB[k]; return v==null?fb:v; };
  var E=function(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  var PN=function(id){ try{ return window.__tv.pName(id); }catch(e){ var p=(DB('PLAYERS',[])).find(function(x){return x.id==id;}); return p?p.name:'#'+id; } };
  var AVA=function(id){ try{ return window.__tv.avaHtml(id); }catch(e){ return ''; } };
  var players=function(){ return (DB('PLAYERS',[])||[]).filter(function(p){ return p && p.id; }); };

  /* ---------- IA en streaming ---------- */
  function aiStream(kind, data, onText){
    return fetch('/api/narrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,data:data})})
    .then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(t||'Error'); });
      var rd=r.body.getReader(), dec=new TextDecoder(), buf='', out='';
      function pump(){
        return rd.read().then(function(x){
          if(x.done) return out;
          buf+=dec.decode(x.value,{stream:true});
          var parts=buf.split('\n'); buf=parts.pop();
          parts.forEach(function(line){
            if(line.indexOf('data:')!==0) return;
            try{ var j=JSON.parse(line.slice(5)); if(j.type==='response.output_text.delta' && j.delta){ out+=j.delta; onText(out); } }catch(e){}
          });
          return pump();
        });
      }
      return pump();
    });
  }

  /* ---------- Elo a partir de todos los partidos ---------- */
  function elo(){
    var R={}; players().forEach(function(p){ R[p.id]=1500; });
    (DB('SINGLES',[])||[]).forEach(function(m){
      if(!m||!m.w||!m.p1||!m.p2) return;
      var a=R[m.p1]||1500, b=R[m.p2]||1500, ea=1/(1+Math.pow(10,(b-a)/400)), sa=m.w===m.p1?1:0;
      R[m.p1]=a+24*(sa-ea); R[m.p2]=b+24*((1-sa)-(1-ea));
    });
    return R;
  }
  function pWin(R,a,b){ return 1/(1+Math.pow(10,((R[b]||1500)-(R[a]||1500))/400)); }

  /* ---------- Simulador Monte Carlo ---------- */
  function bracketOf(t){
    if(t.rounds && t.rounds.length) return t.rounds.concat(t.f?[[t.f]]:[]);
    var r=[]; ['r32','r16','qf','sf'].forEach(function(k){ if(t[k]&&t[k].length) r.push(t[k]); });
    if(t.f) r.push([t.f]); return r;
  }
  function simulate(rounds, R, N){
    var champ={};
    for(var it=0; it<N; it++){
      var prev=null;
      for(var ri=0; ri<rounds.length; ri++){
        var cur=[];
        rounds[ri].forEach(function(m,i){
          var a=(m&&(m.p1||m.a))||(prev?prev[2*i]:null), b=(m&&(m.p2||m.b))||(prev?prev[2*i+1]:null);
          var w=m&&m.w ? m.w : (!a?b:!b?a:(Math.random()<pWin(R,a,b)?a:b));
          cur.push(w);
        });
        prev=cur;
      }
      var c=prev&&prev[0]; if(c) champ[c]=(champ[c]||0)+1;
    }
    return Object.keys(champ).map(function(k){ return {id:+k,p:champ[k]/N}; }).sort(function(x,y){ return y.p-x.p; });
  }
  function renderSim(box){
    var R=elo(), T=window.__TDB||{tournaments:[]}, html='';
    var act=(T.tournaments||[]).filter(function(t){ return t.status!=='hist' && !(t.f&&t.f.w) && bracketOf(t).length && !(t.qf||[]).some(function(m){return m&&m.p1b;}); });
    var blocks=act.map(function(t){ return {title:t.name+' · probabilidad de título', res:simulate(bracketOf(t),R,4000)}; });
    blocks=blocks.filter(function(b){ return b.res.length; });
    if(!blocks.length){
      var top=players().slice().sort(function(a,b){ return (R[b.id]||0)-(R[a.id]||0); }).slice(0,8).map(function(p){return p.id;});
      if(top.length===8){
        var seed=[[0,7],[3,4],[2,5],[1,6]].map(function(s){ return {p1:top[s[0]],p2:top[s[1]]}; });
        blocks.push({title:'Torneo de Maestros imaginario · top 8 por nivel', res:simulate([seed,[{},{}],[{}]],R,4000)});
      }
    }
    html+=blocks.map(function(b){
      return '<div class="pro-sub">'+E(b.title)+'</div>'+b.res.slice(0,8).map(function(r,i){
        var pc=Math.round(r.p*1000)/10;
        return '<div class="pro-bar"><span class="pro-rk">'+(i+1)+'</span>'+AVA(r.id)+'<span class="pro-nm">'+E(PN(r.id))+'</span>'+
          '<span class="pro-track"><i style="width:'+Math.max(2,r.p*100)+'%"></i></span><b>'+pc+'%</b></div>';
      }).join('');
    }).join('') || '<div class="pro-empty">Aún no hay suficientes partidos para simular.</div>';
    html+='<div class="pro-note">4.000 simulaciones con un nivel tipo Elo calculado de todos los partidos. Se recalcula tras cada resultado.</div>';
    box.innerHTML=html;
  }

  /* ---------- Wrapped ---------- */
  function statsOf(id){
    id=+id; var S=DB('SINGLES',[])||[], w=0,l=0, vs={}, run=0, best=0;
    S.forEach(function(m){
      if(!m||!m.w||(m.p1!==id&&m.p2!==id)) return;
      var o=m.p1===id?m.p2:m.p1, win=m.w===id; vs[o]=vs[o]||{w:0,l:0};
      if(win){ w++; vs[o].w++; run++; best=Math.max(best,run); } else { l++; vs[o].l++; run=0; }
    });
    var victim=null, nemesis=null;
    Object.keys(vs).forEach(function(o){
      if(!victim||vs[o].w>vs[victim].w) victim=o;
      if(!nemesis||vs[o].l>vs[nemesis].l) nemesis=o;
    });
    var CR=DB('COMP_RESULTS',[])||[], titles=CR.filter(function(r){return r.champion===id;}), finals=CR.filter(function(r){return r.runnerUp===id;}).length;
    var D=(DB('DOUBLES',[])||[]).filter(function(d){return d.w===id;}).length;
    var pts=DB('SEASON_POINTS',{})||{}, rank=Object.keys(pts).sort(function(a,b){return (pts[b]||0)-(pts[a]||0);}).indexOf(String(id))+1;
    var R=elo(), erank=players().slice().sort(function(a,b){return (R[b.id]||0)-(R[a.id]||0);}).findIndex(function(p){return p.id===id;})+1;
    return {id:id,name:PN(id),w:w,l:l,pct:w+l?Math.round(w/(w+l)*100):0,best:best,
      victim:victim&&vs[victim].w?{id:+victim,n:vs[victim].w}:null, nemesis:nemesis&&vs[nemesis].l?{id:+nemesis,n:vs[nemesis].l}:null,
      titles:titles.map(function(t){return t.name;}), finals:finals, dwins:D, pts:pts[id]||0, rank:rank, elo:Math.round(R[id]||1500), erank:erank};
  }
  function openWrapped(id){
    var s=statsOf(id), i=0, timer=null;
    var slides=[
      {c:'a', k:'Tu temporada en la RFTM', big:E(s.name), sub:'Prepárate. Esto es lo que has hecho.', ava:true},
      {c:'b', k:'Partidos jugados', big:(s.w+s.l), sub:s.w+' victorias · '+s.l+' derrotas'},
      {c:'c', k:'Porcentaje de victorias', big:s.pct+'%', sub:s.pct>=60?'Nivel bestia.':s.pct>=45?'Competitivo de verdad.':'Lo importante es participar… ¿no?'},
      {c:'d', k:'Tu mejor racha', big:s.best, sub:'victorias seguidas sin pestañear'},
      {c:'a', k:'Tu víctima favorita', big:s.victim?E(PN(s.victim.id)):'—', sub:s.victim?'Le ganaste '+s.victim.n+' veces':'Aún sin víctimas', ava2:s.victim&&s.victim.id},
      {c:'b', k:'Tu némesis', big:s.nemesis?E(PN(s.nemesis.id)):'—', sub:s.nemesis?'Te ganó '+s.nemesis.n+' veces. Venganza pendiente.':'Nadie puede contigo', ava2:s.nemesis&&s.nemesis.id},
      {c:'gold', k:'Títulos', big:s.titles.length, sub:s.titles.length?E(s.titles.join(' · ')):(s.finals?s.finals+' finales perdidas. El año que viene.':'El trofeo te espera')},
      {c:'c', k:'Ranking', big:s.rank?'#'+s.rank:'—', sub:s.pts+' puntos · nivel '+s.elo+' (#'+s.erank+' por nivel)'},
      {c:'d', k:'El comentarista dice…', big:'', sub:'', ai:true}
    ];
    var ov=document.createElement('div'); ov.className='wr-ov'; document.body.appendChild(ov);
    function close(){ clearTimeout(timer); ov.remove(); }
    function go(n){
      i=n; if(i<0) i=0; if(i>=slides.length){ close(); return; }
      var sl=slides[i];
      ov.innerHTML='<div class="wr-prog">'+slides.map(function(_,k){return '<span class="'+(k<i?'done':k===i?'cur':'')+'"><i></i></span>';}).join('')+'</div>'+
        '<button class="wr-x" aria-label="Cerrar">×</button>'+
        '<div class="wr-slide wr-'+sl.c+'"><div class="wr-k">'+sl.k+'</div>'+
        (sl.ava?'<div class="wr-ava">'+AVA(s.id)+'</div>':'')+(sl.ava2?'<div class="wr-ava">'+AVA(sl.ava2)+'</div>':'')+
        '<div class="wr-big">'+sl.big+'</div><div class="wr-sub">'+sl.sub+'</div>'+
        (sl.ai?'<div class="wr-ai">Escribiendo…</div><button class="wr-share">Compartir mi Wrapped</button>':'')+
        '</div><div class="wr-tap wr-l"></div><div class="wr-tap wr-r"></div>';
      ov.querySelector('.wr-x').onclick=close;
      ov.querySelector('.wr-l').onclick=function(){ go(i-1); };
      ov.querySelector('.wr-r').onclick=function(){ go(i+1); };
      clearTimeout(timer);
      if(sl.ai){
        var box=ov.querySelector('.wr-ai');
        aiStream('wrapped', s, function(t){ box.textContent=t; }).catch(function(e){ box.textContent=e.message; });
        ov.querySelector('.wr-share').onclick=function(ev){
          ev.stopPropagation();
          var txt='Mi temporada RFTM: '+(s.w+s.l)+' partidos, '+s.pct+'% victorias, racha de '+s.best+', '+s.titles.length+' títulos y #'+(s.rank||'—')+' del ranking. 🎾';
          if(navigator.share) navigator.share({title:'Mi Wrapped RFTM',text:txt,url:location.href}).catch(function(){});
          else { navigator.clipboard && navigator.clipboard.writeText(txt+' '+location.href); ev.target.textContent='¡Copiado!'; }
        };
      } else timer=setTimeout(function(){ go(i+1); },4200);
    }
    go(0);
  }

  /* ---------- Predicciones ---------- */
  function voterId(){ var v=localStorage.getItem('rftm.voter'); if(!v){ v='v'+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem('rftm.voter',v); } return v; }
  function nick(force){
    var n=localStorage.getItem('rftm.nick');
    if(!n||force){ n=(prompt('Tu apodo para el ranking de pronosticadores:', n||'')||'').trim().slice(0,24); if(n) localStorage.setItem('rftm.nick',n); }
    return n;
  }
  var predState={mid:null,counts:{},mine:null,poll:null,comment:'',cBusy:false};
  function loadCounts(mid){
    return window.__rpc('pred_counts',{p_mid:mid}).then(function(rows){
      var c={}; (rows||[]).forEach(function(r){ c[r.pick]=+r.n; }); predState.counts=c;
    }).catch(function(){});
  }
  function tvExtra(ov, d, t){
    if(!ov) return;
    if(predState.mid!==d.mid){
      predState={mid:d.mid,counts:{},mine:localStorage.getItem('rftm.pick.'+d.mid),poll:predState.poll,comment:'',cBusy:false};
      loadCounts(d.mid).then(function(){ window.dispatchEvent(new Event('rftm:pro-tv')); });
    }
    if(!predState.poll) predState.poll=setInterval(function(){
      if(!document.querySelector('.tv-ov')){ clearInterval(predState.poll); predState.poll=null; return; }
      if(predState.mid) loadCounts(predState.mid).then(paint);
    },5000);
    var card=ov.querySelector('.tv-card'); if(!card) return;
    var wrap=document.createElement('div'); wrap.className='pro-tv'; card.after(wrap);
    function paint(){
      var a=predState.counts[d.p1]||0, b=predState.counts[d.p2]||0, tot=a+b, pa=tot?Math.round(a/tot*100):50;
      var locked=t.done;
      wrap.innerHTML='<div class="pro-tv-h">¿Quién gana? <span>'+tot+' pronóstico'+(tot===1?'':'s')+'</span></div>'+
        '<div class="pro-vote">'+
          '<button data-pick="'+d.p1+'" class="'+(predState.mine==d.p1?'on':'')+'"'+(locked?' disabled':'')+'>'+E(PN(d.p1))+'<b>'+pa+'%</b></button>'+
          '<button data-pick="'+d.p2+'" class="'+(predState.mine==d.p2?'on':'')+'"'+(locked?' disabled':'')+'>'+E(PN(d.p2))+'<b>'+(100-pa)+'%</b></button>'+
        '</div><div class="pro-split"><i style="width:'+pa+'%"></i></div>'+
        '<div class="pro-com"><button class="pro-mic">🎙️ Comentario IA</button><div class="pro-com-t">'+E(predState.comment)+'</div></div>';
      wrap.querySelectorAll('[data-pick]').forEach(function(btn){
        btn.onclick=function(){
          var n=nick(); if(!n) return;
          var pick=+btn.getAttribute('data-pick');
          window.__rpc('pred_vote',{p_mid:d.mid,p_voter:voterId(),p_nick:n,p_pick:pick}).then(function(ok){
            if(ok){ predState.mine=pick; localStorage.setItem('rftm.pick.'+d.mid,pick); loadCounts(d.mid).then(paint); }
          }).catch(function(){});
        };
      });
      wrap.querySelector('.pro-mic').onclick=function(){
        if(predState.cBusy) return; predState.cBusy=true;
        var tx=wrap.querySelector('.pro-com-t'); tx.textContent='…';
        var F=window.__tv.fmtFor(d.cat,d.round);
        aiStream('live',{jugadorA:PN(d.p1),jugadorB:PN(d.p2),categoria:d.cat,ronda:d.round,
          sets:t.sets, juegosActuales:[t.gA,t.gB], puntos:[t.ptA,t.ptB], saca:t.server==='a'?PN(d.p1):PN(d.p2),
          bolaDeBreak:!!t.bp, terminado:!!t.done, ganador:t.done?(t.winner==='a'?PN(d.p1):PN(d.p2)):null, formato:F.label,
          ultimosPuntos:(d.log||[]).slice(-8)},
          function(s){ predState.comment=s; var el=document.querySelector('.pro-com-t'); if(el) el.textContent=s; })
        .catch(function(e){ predState.comment=e.message; var el=document.querySelector('.pro-com-t'); if(el) el.textContent=e.message; })
        .finally(function(){ predState.cBusy=false; });
      };
    }
    wrap.__paint=paint; paint();
  }
  window.addEventListener('rftm:pro-tv', function(){ var w=document.querySelector('.pro-tv'); if(w&&w.__paint) w.__paint(); });
  window.__proTv=tvExtra;

  /* ---------- Pestaña PRO ---------- */
  function renderPro(){
    var v=document.getElementById('view-pro'); if(!v) return;
    var opts=players().map(function(p){return '<option value="'+p.id+'">'+E(p.name)+'</option>';}).join('');
    v.innerHTML='<div class="extras-hero"><div class="extras-hero-title">RFTM Pro</div><div class="extras-hero-sub">Simulador, Wrapped, pronósticos y comentarista con IA</div></div>'+
      '<div class="pro-grid">'+
        '<div class="pro-card pro-wide"><div class="pro-h"><span class="pro-ic">🎲</span>Simulador de campeón</div><div id="pro-sim"><div class="pro-empty">Calculando…</div></div></div>'+
        '<div class="pro-card pro-wr"><div class="pro-h"><span class="pro-ic">✨</span>Wrapped de temporada</div><p>Tu temporada contada en historias: víctima, némesis, rachas, títulos…</p>'+
          '<select class="lv-sel" id="pro-wr-p">'+opts+'</select><button class="pro-btn" id="pro-wr-go">Ver Wrapped</button></div>'+
        '<div class="pro-card"><div class="pro-h"><span class="pro-ic">🔮</span>Pronosticadores</div><p>Vota en el Modo TV quién gana cada partido en directo.</p><div id="pro-lb"><div class="pro-empty">Cargando…</div></div></div>'+
        '<div class="pro-card pro-wide"><div class="pro-h"><span class="pro-ic">🎙️</span>Crónica de la liga con IA</div><button class="pro-btn" id="pro-cr-go">Escribir crónica</button><div class="pro-cr" id="pro-cr"></div></div>'+
      '</div>';
    setTimeout(function(){ renderSim(v.querySelector('#pro-sim')); },30);
    v.querySelector('#pro-wr-go').onclick=function(){ openWrapped(v.querySelector('#pro-wr-p').value); };
    window.__rpc('pred_leaderboard',{}).then(function(rows){
      var lb=v.querySelector('#pro-lb');
      lb.innerHTML=(rows&&rows.length)?rows.slice(0,10).map(function(r,i){
        return '<div class="pro-lb"><span class="pro-rk'+(i<3?' m'+i:'')+'">'+(i+1)+'</span><span class="pro-nm">'+E(r.nick)+'</span><b>'+r.hits+'/'+r.total+'</b></div>';
      }).join(''):'<div class="pro-empty">Aún no hay partidos resueltos. ¡Sé el primero en acertar!</div>';
    }).catch(function(){});
    v.querySelector('#pro-cr-go').onclick=function(){
      var btn=this, out=v.querySelector('#pro-cr'); btn.disabled=true; out.textContent='Escribiendo…';
      var R=elo(), pts=DB('SEASON_POINTS',{})||{};
      var data={ranking:Object.keys(pts).sort(function(a,b){return pts[b]-pts[a];}).slice(0,8).map(function(id){return {jugador:PN(id),puntos:pts[id]};}),
        ultimosTorneos:(DB('COMP_RESULTS',[])||[]).slice(-6).map(function(r){return {torneo:r.name,tipo:r.type,campeon:PN(r.champion),finalista:PN(r.runnerUp)};}),
        nivel:players().slice().sort(function(a,b){return R[b.id]-R[a.id];}).slice(0,5).map(function(p){return {jugador:p.name,nivel:Math.round(R[p.id])};}),
        partidosTotales:(DB('SINGLES',[])||[]).length};
      aiStream('chronicle',data,function(t){ out.textContent=t; })
        .catch(function(e){ out.textContent=e.message; }).finally(function(){ btn.disabled=false; });
    };
  }
  function mountPro(){
    var nav=document.querySelector('header .tabs');
    if(nav && !nav.querySelector('[data-tab="pro"]')){
      var b=document.createElement('button'); b.className='tab tab-pro'; b.dataset.tab='pro'; b.textContent='Pro ✦';
      var adm=document.getElementById('adm-tab'); if(adm) nav.insertBefore(b,adm); else nav.appendChild(b);
      b.addEventListener('click',function(){
        document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');}); b.classList.add('active');
        document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active');});
        document.getElementById('view-pro').classList.add('active'); renderPro();
      });
    }
    if(!document.getElementById('view-pro')){
      var s=document.createElement('section'); s.id='view-pro'; s.className='view'; document.querySelector('main').appendChild(s);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mountPro); else setTimeout(mountPro,0);
})();
