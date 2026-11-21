(function(){

  /* No made-up shapes: the map shows the real Agro_Structures layer (live, or the copy shipped with the app). */
  var EMPTYFC={type:'FeatureCollection',features:[]};
  var SATCAT=[{"key":"TRUE_COLOR","label":"True color","group":"visual","formula":"B04, B03, B02","description":"Natural colours, as the eye sees them.","legend":null,"visual":true},{"key":"FALSE_COLOR","label":"Color infrared (vegetation)","group":"visual","formula":"B08, B04, B03","description":"Healthy vegetation in bright red.","legend":null,"visual":true},{"key":"SWIR","label":"SWIR (soil & moisture)","group":"visual","formula":"B12, B8A, B04","description":"Wet soil dark, dry soil and bare ground bright.","legend":null,"visual":true},{"key":"NDVI","label":"NDVI","group":"vegetation","formula":"(B08 − B04) / (B08 + B04)","description":"Vegetation health and density.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"SAVI","label":"SAVI","group":"vegetation","formula":"1.5 × (B08 − B04) / (B08 + B04 + 0.5)","description":"NDVI corrected for bright soil; better for young crops.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"NDWI","label":"NDWI","group":"water","formula":"(B03 − B08) / (B03 + B08)","description":"Open water and water bodies.","legend":[{"value":-0.8,"color":"#008000"},{"value":0,"color":"#ffffff"},{"value":0.8,"color":"#0000cc"}],"visual":false},{"key":"NDMI","label":"NDMI","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Moisture in the crop canopy.","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"NDII","label":"NDII","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Infrared water-content index (same Sentinel-2 bands as NDMI).","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"MSI","label":"Moisture stress (MSI)","group":"water","formula":"B11 / B08","description":"Higher values mean drier, stressed plants.","legend":[{"value":0.2,"color":"#253494"},{"value":0.6,"color":"#41b6c4"},{"value":1,"color":"#ffffcc"},{"value":1.4,"color":"#fd8d3c"},{"value":2,"color":"#bd0026"}],"visual":false},{"key":"BSI","label":"Bare soil (BSI)","group":"soil","formula":"((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))","description":"Bare and exposed soil.","legend":[{"value":-0.6,"color":"#1a9850"},{"value":-0.2,"color":"#91cf60"},{"value":0,"color":"#fee08b"},{"value":0.15,"color":"#fc8d59"},{"value":0.3,"color":"#d73027"},{"value":0.6,"color":"#7f0000"}],"visual":false}];
  try {
    var U={id:'u1',name:'Demo Manager',email:'demo@agrocloud.test',role:'ceo',organizationId:'org1'};
    // Owner account of the demo (all permissions). Demo only: the real system's owner is made with backend/scripts/create-owner.js.
    var OWNER={id:'u0',name:'Owner',email:'admin@agrocloud.com',role:'ceo',isOwner:true,organizationId:'org1'};
    window.__AGRO_DEMO__ = true;
    var who=null; try{ who=localStorage.getItem('agro_demo_user'); }catch(e){}
    if(who==='owner') U=OWNER;
    // First visit opens the landing page; after "Open the demo" or a sign-in the session is kept.
    if(who && (!localStorage.getItem('almaha_user') || localStorage.getItem('almaha_access_token')==='demo-token')){
      localStorage.setItem('almaha_user',JSON.stringify(U));
      localStorage.setItem('almaha_access_token','demo-token');
      localStorage.setItem('almaha_refresh_token','demo-refresh');
    }
  } catch(e){}
  var ZONES=[['AD',['Default Site','Site 1','Site 2']],['AF',['Default Site','Site 2']],['AL AIN',['AL Ain']],['AM',['Default Site','Site 3']],['BH',['Site 3']],['DB',['Default Site','Site 3']],['KE',['Site 3']],['MH',['Default Site','Site 1']]];
  /* The sample fields of MH · Site 1 carry their real Agro_Structures Farm_Code, so they link to their drawn shapes. */
  var REAL_CODES={'GH-01':'MH116','GH-02':'MH117','NH-01':'UOMAHNH001','NH-02':'UOMAHNH002','NH-03':'UOMAHNH003'};
  var countries=[],sites=[],areas=[],fields=[];
  ZONES.forEach(function(z,zi){
    var cid='c'+zi; countries.push({id:cid,name:z[0],code:z[0]});
    z[1].forEach(function(sn,si){
      var sid=cid+'s'+si; sites.push({id:sid,name:sn,countryId:cid,country_id:cid,location:z[0]});
      ['Greenhouse','Nethouse'].forEach(function(an,ai){
        var aid=sid+'a'+ai; areas.push({id:aid,name:an,siteId:sid,site_id:sid});
        for(var k=1;k<=3;k++){ var fid=aid+'f'+k, nm=(ai?'NH-0':'GH-0')+k, code=z[0]+'-'+(si===z[1].length-1?'':'S'+si+'-')+(ai?'NH':'GH')+'-0'+k;
          if(z[0]==='MH'&&sn==='Site 1'&&REAL_CODES[nm]) code=REAL_CODES[nm];
          fields.push({id:fid,name:nm,farmAreaId:aid,farm_area_id:aid,area:1.2,gis_zone_id:z[0],gis_farm_code:code}); }
      });
    });
  });
  /* Zones, sites, farm areas and fields created by "Import from ArcGIS" on this device. */
  var IMP_KEY='agro_demo_import_v2';
  (function(){ var im=null; try{ im=JSON.parse(localStorage.getItem(IMP_KEY)||'null'); }catch(e){} if(!im) return;
    (im.countries||[]).forEach(function(x){countries.push(x);}); (im.sites||[]).forEach(function(x){sites.push(x);});
    (im.areas||[]).forEach(function(x){areas.push(x);}); (im.fields||[]).forEach(function(x){fields.push(x);});
    var mv=im.moves||{}; fields.forEach(function(f){ if(mv[f.id]){ f.farmAreaId=mv[f.id]; f.farm_area_id=mv[f.id]; } });
  })();
  var CROPS=['Tomato','Cucumber','Pepper','Lettuce','Strawberry','Eggplant','Zucchini','Melon'];
  var NAMES=['GH-01','GH-02','GH-03','NH-01','NH-02','NH-03','GH-01','GH-02'];
  var ST=['approved','pending','approved','rejected','approved','pending','approved','approved'];
  var ROWS=NAMES.map(function(n,i){return {id:'r'+(i+1),name:n,code:'C-'+(100+i),title:'Record '+(i+1),
    date:'2026-10-'+(20+i),application_date:'2026-10-'+(20+i),scouting_date:'2026-10-'+(18+i),report_date:'2026-10-'+(18+i),phi_end_date:'2026-10-'+(23+i),
    created_at:'2026-10-'+(20+i)+'T08:00:00Z',updated_at:'2026-10-'+(20+i)+'T09:00:00Z',
    site_id:'c7s1',siteId:'c7s1',site_name:'Site 1',field_id:'c7s1a0f1',fieldId:'c7s1a0f1',field_name:n,
    crop:CROPS[i],crop_name:CROPS[i],variety:'Standard',quantity:120+i*13,amount:40+i*3,value:12+i,total:300+i*20,
    product_name:['Movento 150 OD','Actara 25 WG','Confidor'][i%3],active_ingredient:'Spirotetramat',total_quantity_applied:7.5,cost:1350+i*40,
    dosage:0.5,rate_per_ha:750,uom:'L',phi_days:3,operator_name:'Ahmed Ali',approval_status:ST[i],status:ST[i],application_start_time:'06:30',application_end_time:'08:00',machinery_used:'Sprayer 2000L',
    role:'worker',email:'user'+i+'@farm.test',ec_in:2.1,ph_in:6.1,ec_out:2.6,ph_out:6.4,drain:28+i,temperature:30+i,humidity:50+i,notes:'Routine check',unit:'kg',category:'Fertilizer',is_active:true,count:i+2,harvest_qty:120+i*13,total_quantity:120+i*13};});
  var SEASONS=[{id:'season1',name:'2025-2026',status:'open',start_date:'2025-09-01',end_date:'2026-12-31',startDate:'2025-09-01',endDate:'2026-12-31'}];
  var REPORT={url:'',layer:{name:'Agro_Structures',featureCount:412,geometryType:'esriGeometryPolygon',globalIdField:'GlobalID',editable:false,
    fields:['OBJECTID','ProjectCode','Country','ZONE_ID','SITE','Site_Code','Farm_Code','Farm_Name','Structure_Type','Category','Status','Area_ha','GlobalID'].map(function(n){return {name:n,alias:n,type:n==='OBJECTID'?'OID':'String'};}),types:[]},
    mapping:{globalId:'GlobalID',zoneId:'ZONE_ID',farmCode:'Farm_Code',farmName:'Farm_Name',site:'SITE',siteCode:'Site_Code',structureType:'Structure_Type'},
    keyRoles:[{role:'globalId',label:'Global ID (stable feature id)',required:true},{role:'zoneId',label:'Zone',required:true},{role:'farmCode',label:'Farm code',required:true},
      {role:'farmName',label:'Farm / structure name',required:false},{role:'site',label:'Site',required:false},{role:'siteCode',label:'Site code',required:false},{role:'structureType',label:'Structure type',required:false}],
    keys:{duplicates:[{zone:'DB',farmCode:'DB-GH-07',count:2}],duplicateCount:1,uniqueKeys:409,missingZone:0,missingFarmCode:0,notApplicableSiteCode:'3',
      zones:ZONES.map(function(z,i){return {value:z[0],count:60-i*5};}),sites:[{value:'1 · Site 1',count:220},{value:'2 · Site 2',count:120},{value:'3 · Not Applicable',count:72}],
      structureTypes:[{value:'Greenhouse',count:180},{value:'Nethouse',count:120},{value:'Farm Plots',count:70},{value:'PIVOT',count:42}]},
    agroCloud:{matchedByGlobalId:371,matchedByKey:0,unmatched:41,zonesOnlyInLayer:[],zonesOnlyInAgroCloud:[]},
    checks:[],ok:true,inspectedAt:new Date().toISOString()};
  var CONN=[]; var AICONV=[]; var AIMSG={};
  function ok(data,extra){var o={success:true,data:data}; if(extra) for(var k in extra) o[k]=extra[k]; return o;}

  /* Map editor (/geo): shapes, KeyIDs, subtypes and history kept in this browser.
     MH · Site 1 starts with drawn greenhouse and nethouse fields; the rest is empty,
     ready to draw. Same rules as the server: valid, inside the parent, no overlap. */
  var GEO_KEY='agro_demo_geo_v2';
  try{ localStorage.removeItem('agro_demo_geo_v1'); localStorage.removeItem('agro_demo_import_v1'); }catch(e){}
  var GEO_SUB=[['zone',1,'Region','منطقة','#e8f2ec','#165c3a'],['site',1,'Farm site','موقع مزرعة','#e8f2ec','#1f7a4d'],['site',2,'Nursery site','موقع مشتل','#f1f7e8','#4d7c0f'],['site',9,'Unassigned','غير مخصص','#f3f5f2','#6b746e'],['farm_area',1000,'Greenhouse','بيت محمي','#ffffff','#267300'],['farm_area',1001,'Nethouse','بيت شبكي','#e6f4ff','#005ce6'],['farm_area',1002,'Glasshouse','بيت زجاجي','#eef6f6','#2f7f7f'],['farm_area',1003,'Retractable Roof Houses','بيت بسقف متحرك','#f3ecff','#6a3fb5'],['farm_area',1004,'Cravo','كرافو','#fdeee6','#b5532a'],['farm_area',1005,'Dates Farm','مزرعة نخيل','#f6efdc','#8a6d1d'],['farm_area',1006,'PIVOT','محوري','#e6ffd9','#38a800'],['farm_area',1007,'Farm Plots','قطع زراعية','#fff4d6','#a87000'],['field',1000,'Greenhouse','بيت محمي','#ffffff','#267300'],['field',1001,'Nethouse','بيت شبكي','#e6f4ff','#005ce6'],['field',1002,'Glasshouse','بيت زجاجي','#eef6f6','#2f7f7f'],['field',1003,'Retractable Roof Houses','بيت بسقف متحرك','#f3ecff','#6a3fb5'],['field',1004,'Cravo','كرافو','#fdeee6','#b5532a'],['field',1005,'Dates Farm','مزرعة نخيل','#f6efdc','#8a6d1d'],['field',1006,'PIVOT','محوري','#e6ffd9','#38a800'],['field',1007,'Farm Plots','قطع زراعية','#fff4d6','#a87000']]
    .map(function(a,i){return {class_key:a[0],code:a[1],name_en:a[2],name_ar:a[3],fill_color:a[4],line_color:a[5],sort_order:i};});
  var GEO_DOM=[{key:'irrigation_system',name_en:'Irrigation system',name_ar:'نظام الري',kind:'coded',values:[['drip','Drip','تنقيط'],['sprinkler','Sprinkler','رش'],['pivot','Centre pivot','محوري'],['flood','Flood','غمر'],['hydro','Hydroponic','زراعة مائية']]},
    {key:'soil_type',name_en:'Soil type',name_ar:'نوع التربة',kind:'coded',values:[['sand','Sand','رملية'],['loamy_sand','Loamy sand','رملية طميية'],['loam','Loam','طميية'],['clay','Clay','طينية'],['substrate','Substrate','وسط زراعي']]},
    {key:'status',name_en:'Status',name_ar:'الحالة',kind:'coded',values:[['active','Active','نشط'],['fallow','Fallow','بور'],['planned','Planned','مخطط'],['retired','Retired','متوقف']]}]
    .map(function(d){ return {key:d.key,name_en:d.name_en,name_ar:d.name_ar,kind:d.kind,values:d.values.map(function(v,i){return {domain_key:d.key,code:v[0],name_en:v[1],name_ar:v[2],sort_order:i};})}; });
  function geoRect(x,y,w,h){ return {type:'MultiPolygon',coordinates:[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]]}; }
  function geoStore(){
    var st=null; try{ st=JSON.parse(localStorage.getItem(GEO_KEY)||'null'); }catch(e){}
    if(st) return st;
    /* Starts empty: shapes come from drawing or from "Import from ArcGIS" (the real layer). */
    st={};
    try{ localStorage.setItem(GEO_KEY,JSON.stringify(st)); }catch(e){}
    return st;
  }
  function geoSave(st){ try{ localStorage.setItem(GEO_KEY,JSON.stringify(st)); }catch(e){} }
  function geoFieldKey(z,fc){ z=String(z).trim().toUpperCase().replace(/\s+/g,'-'); fc=String(fc).trim().toUpperCase().replace(/\s+/g,'-'); return (fc.indexOf(z+'-')===0?fc:z+'-'+fc).slice(0,40); }
  function geoKeys(){ var k={};
    countries.forEach(function(c){ k[c.id]=c.code.replace(/\s+/g,''); });
    countries.forEach(function(c){ sites.filter(function(x){return x.countryId===c.id;}).forEach(function(x,i){ k[x.id]=k[c.id]+'-S'+('0'+(i+1)).slice(-2);
      var fn=0; areas.filter(function(a){return a.siteId===x.id;}).forEach(function(a,ai){ k[a.id]=k[x.id]+'-A'+('0'+(ai+1)).slice(-2);
        fields.filter(function(f){return f.farmAreaId===a.id;}).forEach(function(f){ fn++; k[f.id]=(f.gis_zone_id&&f.gis_farm_code)?geoFieldKey(f.gis_zone_id,f.gis_farm_code):k[x.id]+'-F'+('00'+fn).slice(-3); }); }); }); });
    return k; }
  function geoArea(g){ if(!g) return null; var R=6378137, tot=0;
    (g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(function(poly){ poly.forEach(function(ring,ri){ var a=0;
      for(var i=0;i<ring.length-1;i++){ var p1=ring[i],p2=ring[i+1]; a+=(p2[0]-p1[0])*Math.PI/180*(2+Math.sin(p1[1]*Math.PI/180)+Math.sin(p2[1]*Math.PI/180)); }
      a=Math.abs(a*R*R/2); tot+=ri?-a:a; }); });
    return Math.round(tot/10000*10000)/10000; }
  function geoBBox(g){ var b=[180,90,-180,-90]; (g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(function(p){ p[0].forEach(function(c){ b[0]=Math.min(b[0],c[0]);b[1]=Math.min(b[1],c[1]);b[2]=Math.max(b[2],c[0]);b[3]=Math.max(b[3],c[1]); }); }); return b; }
  function geoItems(){ var st=geoStore(), k=geoKeys();
    function item(r,parent){ var e=st[r.id]||{}; return {id:r.id,name:r.name,key_id:k[r.id],subtype_code:e.subtype||null,parent_id:parent,geometry:e.geometry||null,area_ha:geoArea(e.geometry),geom_updated_at:e.at||null}; }
    return {zones:countries.map(function(c){return item(c,null);}),sites:sites.map(function(x){return item(x,x.countryId);}),
      farm_areas:areas.map(function(a){return item(a,a.siteId);}),fields:fields.map(function(f){return item(f,f.farmAreaId);})}; }
  function geoValidate(cls,id,g){ var L=geoItems(), issues=[], area=geoArea(g);
    var list=cls==='zone'?L.zones:cls==='site'?L.sites:cls==='farm_area'?L.farm_areas:L.fields;
    var me=list.filter(function(x){return x.id===id;})[0]; if(!me) return {ok:false,issues:[{code:'invalid',message:'Not found'}],area_ha:null};
    if(!area||area<=0) issues.push({code:'too_small',message:'The shape has no area.'});
    var plist=cls==='site'?L.zones:cls==='farm_area'?L.sites:cls==='field'?L.farm_areas:[];
    var par=plist.filter(function(x){return x.id===me.parent_id;})[0];
    var b=geoBBox(g), eps=0.00005;
    if(par&&par.geometry){ var pb=geoBBox(par.geometry); if(b[0]<pb[0]-eps||b[1]<pb[1]-eps||b[2]>pb[2]+eps||b[3]>pb[3]+eps) issues.push({code:'outside_parent',message:'Part of the shape lies outside '+par.key_id+'.',keys:[par.key_id]}); }
    var sib=list.filter(function(x){ return x.id!==id&&x.geometry&&(cls==='field'?(function(){ var a1=L.farm_areas.filter(function(a){return a.id===x.parent_id;})[0], a2=L.farm_areas.filter(function(a){return a.id===me.parent_id;})[0]; return a1&&a2&&a1.parent_id===a2.parent_id; })():x.parent_id===me.parent_id); });
    var hits=sib.filter(function(x){ var ob=geoBBox(x.geometry); var w=Math.min(b[2],ob[2])-Math.max(b[0],ob[0]), h=Math.min(b[3],ob[3])-Math.max(b[1],ob[1]); return w>eps&&h>eps; });
    if(hits.length) issues.push({code:'overlap',message:'Overlaps '+hits.map(function(x){return x.key_id;}).join(', ')+'.',keys:hits.map(function(x){return x.key_id;})});
    return {ok:!issues.length,issues:issues,area_ha:area}; }
  function body(url,method,reqBody){
    var path=url.replace(/^https?:\/\/[^/]+/,'').replace(/^.*\/api\/v1/,'').split('?')[0];
    var q={}; (url.split('?')[1]||'').split('&').forEach(function(p){var kv=p.split('='); if(kv[0]) q[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||'');});
    /* Fields whose linked ArcGIS feature (GlobalID) is gone from the layer: none in the demo, links follow Farm_Code. */
    if(path==='/fields/gis-orphans') return ok([]);
    // Data paths of the forms (no server in the demo: paths show [your-server], ArcGIS writes need the real server).
    var FEEDS=[['ecph','EC/PH Entry','/ecph-entry','field'],['fertigation','Fertigation Entry','/fertigation/entry','field'],['irrigation','Irrigation Entry','/irrigation/entry','field'],['harvest','Harvest Entry','/harvest/entry','field'],['crop-rotation','Crop Rotation','/admin/crop-history','field'],['pump-room','Pump Room','/pump-room','site']];
    var fdSt=function(){ try{ return JSON.parse(localStorage.getItem('agro_demo_feeds_v1')||'{}'); }catch(e){ return {}; } };
    var fdSave=function(x){ try{ localStorage.setItem('agro_demo_feeds_v1',JSON.stringify(x)); }catch(e){} };
    if(path==='/feeds'){ var fs0=fdSt(); return ok(FEEDS.map(function(f){ var c=fs0[f[0]]||{}; return {form:f[0],label:f[1],page:f[2],relation:'1:N',linkBy:f[3],key:f[3]==='field'?'GlobalID → STRUCT_GLOBALID':'Site KeyID → SITE_KEYID',records:0,arcgisTableUrl:c.url||null,syncMode:c.mode||'off',includeNames:false,lastSyncedAt:null,lastSyncCount:null,lastError:null,keys:c.keys||[],demo:true}; })); }
    var fdm=path.match(/^\/feeds\/([a-z-]+)(?:\/(keys|sync|arcgis-table))?$/), fdk=path.match(/^\/feeds\/keys\/([^/]+)$/);
    if(fdk&&method==='DELETE'){ var fs1=fdSt(); Object.keys(fs1).forEach(function(k){ fs1[k].keys=(fs1[k].keys||[]).filter(function(x){return x.id!==fdk[1];}); }); fdSave(fs1); return ok(null); }
    if(fdm&&method!=='GET'){ var fs2=fdSt(), fc=fs2[fdm[1]]=fs2[fdm[1]]||{};
      if(fdm[2]==='keys'){ var hex=''; for(var hi=0;hi<48;hi++) hex+='0123456789abcdef'[Math.floor(Math.random()*16)]; var raw='feed_'+fdm[1].replace(/-/g,'')+'_'+hex; var kk={id:'k'+Date.now(),form:fdm[1],key_prefix:raw.slice(0,raw.indexOf('_',5)+5),created_at:new Date().toISOString(),last_used:null}; fc.keys=[kk].concat(fc.keys||[]); fdSave(fs2); return ok(Object.assign({key:raw},kk)); }
      if(fdm[2]) return {success:false,error:{code:'DEMO',message:'The demo has no server. Creating and syncing ArcGIS tables runs on the AgroCloud server with an ArcGIS owner token.'}};
      if(reqBody&&reqBody.syncMode) fc.mode=reqBody.syncMode; if(reqBody&&reqBody.arcgisTableUrl!==undefined) fc.url=reqBody.arcgisTableUrl||null; fdSave(fs2); return ok(null); }
    if(path==='/geo/model') return ok({subtypes:GEO_SUB,domains:GEO_DOM});
    if(path==='/geo/layers') return ok(geoItems());
    var gfm=path.match(/^\/geo\/(zone|site|farm_area|field)\/([^/]+)\/forms$/);
    if(gfm){ var fc0=gfm[1]==='field'?1:fields.filter(function(f){ if(gfm[1]==='farm_area') return f.farmAreaId===gfm[2]; var a=areas.filter(function(x){return x.id===f.farmAreaId;})[0]; if(!a) return false; if(gfm[1]==='site') return a.siteId===gfm[2]; var s0=sites.filter(function(x){return x.id===a.siteId;})[0]; return s0&&s0.countryId===gfm[2]; }).length;
      return ok({field_count:fc0,forms:[]}); }
    var gm=path.match(/^\/geo\/(zone|site|farm_area|field)\/([^/]+)\/(validate|geometry|subtype|history)$/);
    if(gm){
      var gcls=gm[1], gid=gm[2], gop=gm[3], gst=geoStore(), now=new Date().toISOString();
      var gfind=function(){ var L=geoItems(); var lst=gcls==='zone'?L.zones:gcls==='site'?L.sites:gcls==='farm_area'?L.farm_areas:L.fields; return lst.filter(function(x){return x.id===gid;})[0]; };
      if(gop==='validate') return ok(geoValidate(gcls,gid,reqBody&&reqBody.geometry));
      if(gop==='history') return ok(((gst[gid]||{}).history||[]).slice().reverse());
      gst[gid]=gst[gid]||{history:[]};
      if(gop==='subtype'){ gst[gid].subtype=reqBody?reqBody.subtypeCode:null; gst[gid].history.push({id:Date.now(),operation:'subtype',edited_at:now,edited_by_name:'Demo Manager',area_ha:geoArea(gst[gid].geometry)}); geoSave(gst); return ok(gfind()); }
      if(method==='DELETE'){ gst[gid].history.push({id:Date.now(),operation:'delete',edited_at:now,edited_by_name:'Demo Manager',area_ha:null}); gst[gid].geometry=null; geoSave(gst); return ok(gfind()); }
      var gchk=geoValidate(gcls,gid,reqBody&&reqBody.geometry);
      if(!gchk.ok) return {success:false,error:{code:'GEOMETRY_RULE',message:gchk.issues.map(function(i){return i.message;}).join(' '),details:{issues:gchk.issues}}};
      var g0=reqBody.geometry; gst[gid].history.push({id:Date.now(),operation:reqBody.operation||(gst[gid].geometry?'edit':'draw'),edited_at:now,edited_by_name:'Demo Manager',area_ha:geoArea(g0)});
      gst[gid].geometry=g0.type==='Polygon'?{type:'MultiPolygon',coordinates:[g0.coordinates]}:g0; gst[gid].at=now; gst[gid].src='agrocloud';
      if(reqBody.subtypeCode!==undefined) gst[gid].subtype=reqBody.subtypeCode;
      geoSave(gst); return ok(gfind());
    }
    // Demo inventory: real-looking inputs with stock, minimum level and cost.
    if(path==='/inventory'||path==='/inventory/low-stock'){
      var INV=[['NPK 20-20-20','fertilizer','kg',420,200,6.5,'Yara'],['Calcium nitrate','fertilizer','kg',150,250,4.2,'Yara'],['Potassium sulphate','fertilizer','kg',90,120,5.8,'SQM'],
        ['Magnesium sulphate','fertilizer','kg',310,100,3.1,'K+S'],['Movento 150 OD','pesticide','L',12,10,310,'Bayer'],['Actara 25 WG','pesticide','kg',2.5,4,420,'Syngenta'],
        ['Confidor 200 SL','pesticide','L',6,5,185,'Bayer'],['Swirski-Mite','biological','unit',18,20,95,'Koppert'],['Phytoseiulus-System','biological','unit',9,10,120,'Koppert'],
        ['Drip tape 16 mm','other','m',2400,1000,0.35,'Netafim']].map(function(a,i){return {id:'inv'+(i+1),name:a[0],category:a[1],unit:a[2],current_stock:a[3],min_stock_level:a[4],cost_per_unit:a[5],currency:'AED',supplier:a[6],is_active:true};});
      var cat=q.category||'', srch=(q.search||'').toLowerCase();
      var list=INV.filter(function(r){return (!cat||r.category===cat)&&(!srch||r.name.toLowerCase().indexOf(srch)>=0||r.supplier.toLowerCase().indexOf(srch)>=0)&&(path!=='/inventory/low-stock'&&q.low_stock!=='true'||r.current_stock<r.min_stock_level);});
      return {success:true,data:list,meta:{total:list.length}};
    }
    // Demo sign-in: email demo@agrocloud.test, password demo1234 (or the 4-digit PIN 1234).
    if(path==='/auth/login'||path==='/auth/pin-login'){
      var cred={}; try{ cred=typeof reqBody==='string'?JSON.parse(reqBody):(reqBody||{}); }catch(e){}
      var em=String(cred.email||'').trim().toLowerCase();
      var isOwner = path==='/auth/login' && em==='admin@agrocloud.com' && String(cred.password||'')==='Admin12345';
      var okLogin = isOwner || (path==='/auth/pin-login' ? String(cred.pin||'')==='1234'
        : em==='demo@agrocloud.test' && String(cred.password||'')==='demo1234');
      if(!okLogin) return {success:false,error:{message:'Wrong email or password'}};
      U = isOwner ? OWNER : {id:'u1',name:'Demo Manager',email:'demo@agrocloud.test',role:'ceo',organizationId:'org1'};
      try{ localStorage.setItem('agro_demo_user', isOwner?'owner':'demo'); }catch(e){}
      return {success:true,data:{user:U,accessToken:'demo-token',refreshToken:'demo-refresh'}};
    }
    if(path==='/auth/logout'){ try{ localStorage.removeItem('agro_demo_user'); }catch(e){} return {success:true}; }
    if(/^\/auth\/(me|profile|refresh|verify)/.test(path)) return {success:true,data:U,user:U,accessToken:'demo-token',token:'demo-token'};



    if(path==='/soil-grids/point'){ var la=Number(q.lat),lo=Number(q.lon),dps=(q.depths||'0,30,60').split(',').map(Number); var wv=function(b,a){return Math.round((b+a*Math.sin(la*37+lo*11))*10)/10;};
      var mk=function(key,prop,unit,f){ var r={key:key,property:prop,unit:unit}; dps.forEach(function(d,i){ r[d+'cm']=f(d,i); }); return r; };
      return ok({lat:la,lon:lo,depths:dps,source:'OpenLandMap (OpenGeoHub) · 250 m · demo values',rows:[
        mk('ph','Soil pH (H2O)','pH',function(d){return wv(8.0+d/200,0.2);}),
        mk('organic_carbon','Organic carbon','g/kg',function(d){return Math.max(0,Math.round((6-d/25)*5)/5*5)/5;}),
        mk('clay','Clay','%',function(d){return Math.round(wv(9+d/20,2));}),
        mk('sand','Sand','%',function(d){return Math.round(wv(78-d/15,4));}),
        mk('bulk_density','Bulk density','kg/m³',function(d){return Math.round(wv(1520+d,30));}),
        mk('water_33kpa','Water at field capacity (33 kPa)','% vol',function(d){return Math.round(wv(14+d/30,2));}),
        mk('texture','Texture class (USDA)','',function(d){return d<60?'Loamy sand':'Sandy loam';})]}); }

    if(path==='/gis/layers'&&method==='GET') return ok([{id:'demo-struct',name:'Agro_Structures (GCC)',sourceType:'arcgis_feature_service',featureCount:0,isVisible:true,style:{color:'#1f7a4d',fillOpacity:0.25}}]);
    if(path==='/gis/layers/demo-struct/features') return ok(EMPTYFC);
    if(path==='/satellite/status'){ var dc=window.__devSat&&window.__devSat.cfg(); return ok(dc?{configured:true,service:dc.service,label:(dc.label||'Sentinel-2')+' · live on this device'}:{configured:false,service:'sentinel-hub',label:null}); }
    if(path==='/satellite/indices') return ok(SATCAT);
    if(path==='/satellite/tile-key') return ok({key:'demo.key',expiresAt:new Date(Date.now()+12*3600e3).toISOString()});
    if(path==='/satellite/scenes') return ok([]);
    if(path==='/satellite/stats') return ok([]);
    if(path==='/settings/sentinelhub'&&method==='GET'){ var c2=window.__devSat&&window.__devSat.cfg(); return ok(c2?{configured:true,idMasked:c2.id.slice(0,4)+'••••-••••-'+c2.id.slice(-4),service:c2.service,label:c2.label||null}:{configured:false,idMasked:null,service:'sentinel-hub',label:null}); }
    if(path==='/ai/status') return ok({configured:true,provider:'demo',model:'demo'});
    var actM=path.match(/^\/ai\/actions\/([^/]+)\/(confirm|cancel)$/);
    if(actM){
      window.__AIACT=window.__AIACT||{}; var cur=window.__AIACT[actM[1]]||'pending';
      if(cur!=='pending') return {success:false,error:{message:'This action is already '+cur+'.',code:'CONFLICT'}};
      window.__AIACT[actM[1]]= actM[2]==='confirm'?'done':'cancelled';
      return ok(actM[2]==='confirm'?{id:actM[1],status:'done',result:{entity:'task',id:'demo-task',link:'/tasks',label:'Demo task'}}:{id:actM[1],status:'cancelled'});
    }
    if(path==='/ai/conversations') return ok(AICONV);
    if(/^\/ai\/conversations\/[^/]+\/messages$/.test(path)){ var cid=path.split('/')[3]; return ok(AIMSG[cid]||[]); }
    if(/^\/ai\/conversations\/[^/]+$/.test(path)&&method==='DELETE'){ var did=path.split('/')[3]; AICONV=AICONV.filter(function(c){return c.id!==did;}); return ok(null); }
    if(path==='/ai/ask'){
      var t=(reqBody&&reqBody.text||''), ar=/[؀-ۿ]/.test(t), cidA=reqBody&&reqBody.conversationId;
      if(!cidA){ cidA='demo-'+Date.now(); AICONV.unshift({id:cidA,title:t.slice(0,60),updated_at:new Date().toISOString()}); AIMSG[cidA]=[]; }
      var HF={form_id:'7c774b7b-8363-5887-b013-736ed63651b8',form_key:'harvest.entry',title_en:'Harvest Entry',title_ar:'إدخال الحصاد'};
      var PF={form_id:'9d7636be-db18-5857-811d-afafda3efde8',form_key:'ipm.pesticide_spray',title_en:'Pesticide — Spray',title_ar:'المبيدات — رش'};
      var msg;
      if(/مهمة|task/i.test(t)){
        var fm=(t.match(/\b(GH|NH)-\d{2}\b/i)||['GH-02'])[0].toUpperCase();
        var dd=new Date(Date.now()+86400000+4*3600000).toISOString().slice(0,10);
        msg={content: ar?'جهّزت المهمة. راجعها واضغط **Confirm** لإنشائها، ولن يتغير شيء قبل ذلك.':'The task is ready. Check it and press **Confirm** to create it; nothing changes before that.',
          artifacts:[{kind:'action',id:'demo-act-'+Date.now(),action:'create_task',title:(ar?'New task: فحص النقّاطات':'New task: Check the drippers'),lines:[['Priority','medium'],['Field',fm+' · Site 1'],['Due',dd]],status:'pending'}],sources:[]};
      } else if(/حصاد|harvest/i.test(t)){
        var rows=[{zone:'MH',field:'GH-01',sum_total_quantity:800,records:12},{zone:'MH',field:'GH-02',sum_total_quantity:450,records:9},{zone:'AD',field:'NH-01',sum_total_quantity:320,records:6},{zone:'AD',field:'NH-02',sum_total_quantity:210,records:4}];
        msg={content: ar?'إجمالي الحصاد في **أكتوبر 2026** بلغ **1,780 كجم** من 4 حقول. أعلى حقل **GH-01** (800 كجم).\n\n- المصدر: استمارة إدخال الحصاد\n- الفترة: 1–31 أكتوبر':'Total harvest in **October 2026** was **1,780 kg** from 4 fields; highest **GH-01** (800 kg).',
          artifacts:[{kind:'table',title:ar?'الحصاد لكل حقل — أكتوبر 2026':'Harvest per field — October 2026',columns:['zone','field','sum_total_quantity','records'],rows:rows,total:4,chart:{type:'bar',x:'field',y:['sum_total_quantity']},form:HF}],sources:[HF]};
      } else if(/مبيد|تكلفة|pesticide|cost/i.test(t)){
        var rows2=[{site:'MH · Site 1',sum_cost:4210,records:6},{site:'AD · Site 1',sum_cost:2890,records:4},{site:'AF · Site 2',sum_cost:1350,records:2}];
        msg={content: ar?'تكلفة المبيدات هذا الموسم **8,450** موزعة على 3 مواقع، أعلاها **MH · Site 1**.':'Pesticide cost this season is **8,450** across 3 sites; highest **MH · Site 1**.',
          artifacts:[{kind:'table',title:ar?'تكلفة المبيدات لكل موقع — موسم 2025-2026':'Pesticide cost per site — 2025-2026',columns:['site','sum_cost','records'],rows:rows2,total:3,chart:{type:'pie',x:'site',y:['sum_cost']},form:PF}],sources:[PF]};
      } else if(/فترة ما قبل الحصاد|phi/i.test(t)){
        var rows3=[{field:'GH-02',product_name:'Actara 25 WG',phi_end_date:'2026-11-10'},{field:'NH-01',product_name:'Movento 150 OD',phi_end_date:'2026-11-09'}];
        msg={content: ar?'يوجد **حقلان** ضمن فترة ما قبل الحصاد الآن؛ لا تحصد منهما قبل التواريخ في الجدول.':'**2 fields** are inside an active PHI now; do not harvest them before the dates shown.',
          artifacts:[{kind:'table',title:ar?'الحقول ضمن فترة ما قبل الحصاد':'Fields inside an active PHI',columns:['field','product_name','phi_end_date'],rows:rows3,total:2,chart:null,form:PF}],sources:[PF]};
      } else if(/خصائص التربة|قوام|ph|كربون|texture|soil propert|openlandmap/i.test(t)){
        var rows5=[{property:'Soil pH (H2O)',unit:'pH','0cm':8.1,'30cm':8.2,'60cm':8.3},{property:'Organic carbon',unit:'g/kg','0cm':5,'30cm':3,'60cm':2},{property:'Clay',unit:'%','0cm':9,'30cm':11,'60cm':12},{property:'Sand',unit:'%','0cm':78,'30cm':76,'60cm':74},{property:'Bulk density',unit:'kg/m³','0cm':1520,'30cm':1550,'60cm':1580},{property:'Water at field capacity (33 kPa)',unit:'% vol','0cm':14,'30cm':15,'60cm':16},{property:'Texture class (USDA)',unit:'','0cm':'Loamy sand','30cm':'Loamy sand','60cm':'Sandy loam'}];
        msg={content: ar?'تربة الحقل **GH-01** رملية طميية، قلوية قليلاً (**pH 8.1**) وفقيرة بالكربون العضوي (**5 g/kg**)، والسعة الحقلية منخفضة (**14%**) — الري المتقارب بكميات صغيرة أنسب.\n\n- المصدر: خرائط التربة العالمية OpenLandMap (250 م) — قيم تقديرية، أكّدها بتحليل مختبر.':'Field **GH-01** is a loamy sand, slightly alkaline (**pH 8.1**), low in organic carbon (**5 g/kg**) with low field capacity (**14%**) — short, frequent irrigation suits it.\n\n- Source: OpenLandMap global soil maps (250 m) — modelled values; confirm with a lab test.',
          artifacts:[{kind:'table',title:ar?'خصائص التربة · GH-01':'Soil properties · GH-01',columns:['property','unit','0cm','30cm','60cm'],rows:rows5,total:7,chart:null}],sources:[]};
      } else if(/رطوبة|حساس|تربة|soil|moisture|sensor/i.test(t)){
        var rows4=[{field:'GH-01',readings:7,avg_moisture_pct:29.9,avg_temperature_c:27.0,avg_ec_dsm:1.66,avg_ph:6.4},{field:'GH-02',readings:7,avg_moisture_pct:24.1,avg_temperature_c:27.8,avg_ec_dsm:1.92,avg_ph:6.6},{field:'NH-01',readings:7,avg_moisture_pct:31.5,avg_temperature_c:25.9,avg_ec_dsm:1.43,avg_ph:6.6},{field:'NH-02',readings:7,avg_moisture_pct:18.7,avg_temperature_c:28.4,avg_ec_dsm:2.21,avg_ph:6.9}];
        msg={content: ar?'متوسط رطوبة التربة آخر 7 أيام: أقلها **NH-02 (18.7%)** مع أعلى EC **2.21 dS/m** — يستحق المراجعة. أعلاها **NH-01 (31.5%)**.\n\n- المصدر: قراءات حساسات التربة':'Average soil moisture, last 7 days: lowest **NH-02 (18.7%)** with the highest EC **2.21 dS/m** — worth checking. Highest **NH-01 (31.5%)**.',
          artifacts:[{kind:'table',title:ar?'حساسات التربة لكل حقل — آخر 7 أيام':'Soil sensors per field — last 7 days',columns:['field','readings','avg_moisture_pct','avg_temperature_c','avg_ec_dsm','avg_ph'],rows:rows4,total:4,chart:{type:'bar',x:'field',y:['avg_moisture_pct']}}],sources:[]};
      } else if(/كيف|how/i.test(t)){
        msg={content: ar?'لتسجيل تطبيق مبيد:\n\n1. افتح **المكافحة المتكاملة ← تطبيقات المبيدات** (`/ipm/pesticide-applications`).\n2. اضغط **تطبيق جديد**.\n3. اختر الحقل والمنتج والجرعة وتاريخ التطبيق.\n4. احفظ؛ يُحسب تاريخ انتهاء فترة ما قبل الحصاد تلقائياً.':'To record a pesticide application:\n\n1. Open **IPM → Pesticide Applications**.\n2. Click **New Application**.\n3. Choose field, product, dose and date.\n4. Save — the PHI end date is calculated.',artifacts:[],sources:[]};
      } else {
        msg={content: ar?'هذه صفحة تجريبية ببيانات نموذجية. جرّب: «كم الحصاد لكل حقل؟»، «تكلفة المبيدات لكل موقع»، «ما الحقول ضمن فترة ما قبل الحصاد؟»، أو «كيف أسجّل تطبيق مبيد؟»، أو «رطوبة التربة لكل حقل». في النظام الحقيقي يجيب المساعد على أي سؤال من قاعدة البيانات.':'This is a demo with sample data. Try: harvest per field, pesticide cost per site, fields inside PHI, or how to record a pesticide application.',artifacts:[],sources:[]};
      }
      var m={id:'m'+Date.now(),role:'assistant',created_at:new Date().toISOString(),content:msg.content,artifacts:msg.artifacts,sources:msg.sources};
      AIMSG[cidA].push({id:'u'+Date.now(),role:'user',content:t,artifacts:[],sources:[]}); AIMSG[cidA].push(m);
      return ok({conversationId:cidA,message:m});
    }
    // Demo-only: every form with records on one field (GIS map → View field data).
    var ffm=method==='GET'&&path.match(/^\/fields\/([^/]+)\/forms$/);
    if(ffm){
      var fid=ffm[1], ff=fields.filter(function(f){return f.id===fid;})[0]||{name:fid}, fi=Math.max(0,fields.indexOf(ff));
      var hr=function(k){var h=2166136261,x=fid+k;for(var i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%10000)/10000;};
      var day=function(n){return new Date(Date.now()-n*86400000).toISOString().slice(0,10);};
      var mk=function(key,title,route,count,every,rec){var rs=[];for(var i=0;i<Math.min(count,12);i++){rs.push({record_id:key+'-'+fid+'-'+i,record_date:day(i*every),values:rec(i)});}
        return {form_id:'demo-'+key,form_key:key,title_en:title,ui_route:route,record_count:count,last_record_date:day(0),records:rs};};
      var crop=CROPS[fi%CROPS.length];
      var out=[
        mk('ecph.entry','EC/pH Entry','/ecph-entry',63,1,function(i){return {ec_in:+(2.0+hr('ei'+i)*0.15).toFixed(2),ec_out:+(2.2+hr('eo'+i)*0.5).toFixed(2),ph_in:+(5.9+hr('pi'+i)*0.2).toFixed(1),ph_out:+(6.0+hr('po'+i)*0.6).toFixed(1),drain_percent:Math.round(18+hr('d'+i)*10)};}),
        mk('harvest.entry','Harvest Entry','/harvest/entry',27,1,function(i){return {crop:crop,total_quantity:Math.round(180+hr('h'+i)*420),grade:i%3?'A':'B',boxes:Math.round(12+hr('b'+i)*30)};}),
        mk('irrigation.entry','Irrigation Entry','/irrigation/entry',30,1,function(i){return {water_m3:+(30+hr('w'+i)*20).toFixed(1),cycles:Math.round(6+hr('c'+i)*6),duration_min:Math.round(8+hr('m'+i)*6)};}),
        mk('fertigation.entry','Fertigation Entry','/fertigation/entry',18,2,function(i){return {product:['Calcium nitrate','MKP','Potassium sulphate'][i%3],quantity_kg:+(4+hr('f'+i)*6).toFixed(1),ec_target:2.2};}),
        mk('ipm.scouting_report','Scouting Reports','/ipm/scouting-reports',fi%4===3?6:3,5,function(i){return {pest:['Whitefly','Thrips','Aphids'][i%3],infestation_percent:Math.round(2+hr('s'+i)*14),severity:i?'low':'medium'};}),
      ];
      if(fi%4===1) out.push(mk('ipm.pesticide_spray','Pesticide — Spray','/ipm/pesticide-applications',4,6,function(i){return {product_name:'Movento 150 OD',dosage:'0.75 ml/L',phi_days:3,cost:Math.round(80+hr('p'+i)*60)};}));
      return ok({field_id:fid,zone_id:'MH',farm_code:ff.gisFarmCode||ff.name,forms:out});
    }
    // Demo-only field summary for the GIS map panel, from the same sample readings.
    var fsm=method==='GET'&&path.match(/^\/fields\/([^/]+)\/summary$/);
    if(fsm){
      var sf=fields.filter(function(f){return f.id===fsm[1];})[0], si=Math.max(0,fields.indexOf(sf));
      var sr=function(k){var h=2166136261,x=fsm[1]+k;for(var i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%10000)/10000;};
      var ar=sf?areas.filter(function(a){return a.id===sf.farmAreaId;})[0]:null, st=ar?sites.filter(function(x){return x.id===ar.siteId;})[0]:null;
      return ok({field:{id:fsm[1],name:sf?sf.name:fsm[1],siteName:st?st.name:'',farmAreaName:ar?ar.name:'',cropName:CROPS[si%CROPS.length],varietyName:'Standard',area:+(0.4+sr('a')*0.8).toFixed(2)},
        activePhi:si%4===1?[{productName:'Movento 150 OD',phiDays:3,phiEndDate:new Date(Date.now()+2*86400000).toISOString(),daysRemaining:2}]:[],
        harvest:{totalKg:Math.round(7800+si*900+sr('h')*2400),count:27},water:{totalM3:+(1650+si*120+sr('w')*300).toFixed(1)},
        ecph:{avgEcIn:+(2.0+sr('ei')*0.15).toFixed(2),avgEcOut:+(2.2+si*0.08+sr('eo')*0.2).toFixed(2),avgPhIn:+(5.95+sr('pi')*0.2).toFixed(2),avgPhOut:+(6.2+sr('po')*0.3).toFixed(2)},
        scouting:si%4===3?[{reportDate:new Date(Date.now()-86400000).toISOString().slice(0,10),pestName:'Whitefly',infestationPct:12,severity:'medium',status:'open'}]:[],
        pesticides:[]});
    }
    // Demo-only field overview for the Farm Monitor, from the same sample readings as the EC/pH dashboard.
    /* Daily brief from the same field overview the dashboard uses, so both pages agree. */
    if(method==='GET'&&path==='/analytics/daily-brief'){
      var ovr=body('/api/v1/ipm/field-overview'+(q.site_id?'?site_id='+encodeURIComponent(q.site_id):''),'GET',null);
      var ov=(ovr&&ovr.data)||[], todayD=new Date();
      var phiFields=ov.filter(function(f){return f.active_phi_count>0;}).map(function(f){var end=f.nearest_phi_end||new Date(todayD.getTime()+2*864e5).toISOString().slice(0,10);
        return {fieldId:f.id,applicationId:'demo-'+f.id,fieldName:f.name,zoneName:f.field_type_name,productName:(f.spray_today&&f.spray_today.product)||'Movento 150 OD',phiEndDate:end,daysRemaining:Math.max(0,Math.ceil((new Date(end)-todayD)/864e5))};});
      var pestAlerts=ov.filter(function(f){return f.latest_scouting&&f.latest_scouting.status!=='resolved';}).map(function(f){return {reportId:f.latest_scouting.id+'-'+f.id,fieldName:f.name,pestName:f.latest_scouting.pest,severity:(f.latest_scouting.pct||0)>=10?'high':'medium',reportDate:new Date(todayD.getTime()-864e5).toISOString()};});
      var byField=ov.slice(0,12).map(function(f){return {fieldName:f.name,zoneName:f.field_type_name,totalKg:Math.round((f.harvest_this_week||0)/7)};}).filter(function(h){return h.totalKg>0;});
      var totalKg=byField.reduce(function(a,h){return a+h.totalKg;},0);
      var spray=ov.filter(function(f){return f.spray_today;});
      return ok({summary:{phiBlocked:phiFields.length,pestAlerts:pestAlerts.length,recentAlerts:0,pendingChangeRequests:0,openWorkOrders:spray.length},
        phiFields:phiFields,pestAlerts:pestAlerts,yesterdayHarvest:{totalKg:totalKg,byField:byField},pendingChangeRequests:[],openWorkOrders:[],recentAlerts:[]});
    }
    if(method==='GET'&&path==='/ipm/field-overview'){
      var oSite=q.site_id, oAreas=areas.filter(function(a){return !oSite||a.siteId===oSite;}).map(function(a){return a.id;});
      var oFields=fields.filter(function(f){return oAreas.indexOf(f.farmAreaId)>=0;});
      var oRnd=function(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%10000)/10000;};
      var oDay=new Date(); oDay.setUTCHours(0,0,0,0); oDay=new Date(oDay.getTime()-86400000).toISOString().slice(0,10);
      return ok(oFields.map(function(f,fi){
        var imp=/^imp/.test(f.id), ar=areas.filter(function(x){return x.id===f.farmAreaId;})[0];
        var r=function(k){return oRnd(f.id+oDay+k);}, ecB=imp?1.9+oRnd(f.id+'ecb')*0.8:2.1+fi*0.11, phB=imp?5.7+oRnd(f.id+'phb')*0.8:6.05+fi*0.09+(fi===0?0.9:0);
        var nm=String(f.name||'').toUpperCase();
        return {id:f.id,name:f.name,field_type_name:imp&&ar?ar.name:/^GH/.test(nm)?'Greenhouse':/^NH/.test(nm)?'Nethouse':/PIVOT/.test(nm)?'Pivot':'Open field',
          crop_name:CROPS[fi%CROPS.length],current_crop_id:null,
          latest_ecph:{date:oDay,ec_in:+(1.95+r('ei1')*0.2).toFixed(2),ec_out:+(ecB+r('eo1')*0.3).toFixed(2),ph_in:+(5.9+r('pi1')*0.3).toFixed(2),ph_out:+(phB+r('po1')*0.3).toFixed(2)},
          active_phi_count:fi===1?1:0,nearest_phi_end:fi===1?new Date(Date.now()+2*86400000).toISOString():null,active_phi_details:[],
          latest_scouting:fi===3?{id:'sc1',pest:'Whitefly',pct:12,status:'open'}:null,
          spray_today:fi===1?{id:'sp1',product:'Movento 150 OD'}:null,
          harvest_this_week:Math.round(1800+(fi%6)*260+r('h')*600),water_this_week:+(420+(fi%6)*35+r('w')*80).toFixed(1)};
      }));
    }
    // Demo-only sample readings so the form dashboards have something to show. The real server never sees these.
    if(method==='GET'&&(path==='/ecph'||path==='/harvests'||path==='/fertigation'||path==='/irrigation-drip')){
      if(Number(q.page||1)>1) return ok([],{meta:{total:0,page:Number(q.page),totalPages:1}});
      var dSite=q.site_id, dAreas=areas.filter(function(a){return !dSite||a.siteId===dSite;}).map(function(a){return a.id;});
      var dFields=fields.filter(function(f){return dAreas.indexOf(f.farmAreaId)>=0&&(!q.field_id||f.id===q.field_id);});
      if(!dSite&&!q.field_id) dFields=dFields.slice(0,120);
      var dRnd=function(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%10000)/10000;};
      var dEnd=new Date(); dEnd.setUTCHours(0,0,0,0); var dOut=[];
      for(var dd=55;dd>=1;dd--){
        var dt=new Date(dEnd.getTime()-dd*86400000).toISOString().slice(0,10);
        if((q.start_date&&dt<q.start_date)||(q.end_date&&dt>q.end_date)) continue;
        dFields.forEach(function(f,fi){
          var r=function(k){return dRnd(f.id+dt+k);}, t=(55-dd)/55, crop=CROPS[fi%CROPS.length], imp=/^imp/.test(f.id);
          if(path==='/ecph'){
            var ecB=imp?1.9+dRnd(f.id+'ecb')*0.8:2.1+fi*0.11, phB=(imp?5.7+dRnd(f.id+'phb')*0.8:6.05+fi*0.09)+(fi===0?t*0.9:0);
            dOut.push({id:'de'+f.id+dt,date:dt,fieldId:f.id,fieldName:f.name,valveReadings:[1,2].map(function(v){return {valveNumber:v,ecIn:+(1.95+r('ei'+v)*0.2).toFixed(2),ec:+(ecB+r('eo'+v)*0.3).toFixed(2),phIn:+(5.9+r('pi'+v)*0.3).toFixed(2),ph:+(phB+r('po'+v)*0.3).toFixed(2),dripVolume:1200,drain:Math.round(220+r('dr'+v)*80),percentDrain:+(0.17+r('pd'+v)*0.08).toFixed(3)};})});
          } else if(path==='/harvests'){
            if(dd%2===fi%2) dOut.push({id:'dh'+f.id+dt,date:dt,fieldId:f.id,fieldName:f.name,totalQuantity:Math.round(260+(fi%6)*40+r('q')*320+t*120),varieties:[{variety:crop,quantity:Math.round(260+(fi%6)*40+r('q')*320+t*120),grade:r('g')>0.25?'A':'B'}]});
          } else if(path==='/fertigation'){
            var n=+(18+r('n')*8).toFixed(1),k=+(22+r('k')*9).toFixed(1),pz=+(6+r('p')*4).toFixed(1);
            dOut.push({id:'df'+f.id+dt,date:dt,fieldId:f.id,fieldName:f.name,dailyWater:+(9+(fi%6)*0.8+r('w')*4).toFixed(1),flowRate:+(2.4+r('f')*0.6).toFixed(2),frequency:4+Math.round(r('fr')*3),valvesCount:2,recipeId:['Tomato vegetative','Cucumber fruiting','Leafy greens'][fi%3],fertilizers:{'Calcium nitrate':n,'Potassium sulphate':k,'MAP':pz,'Magnesium sulphate':+(3+r('m')*2).toFixed(1)},totalFertilizer:+(n+k+pz).toFixed(1)});
          } else {
            var fq=5+Math.round(r('c')*4), wq=+(2.2+r('wq')*0.6).toFixed(2);
            dOut.push({id:'di'+f.id+dt,date:dt,fieldId:f.id,locationLabel:f.name,waterQtyM3:wq,frequency:fq,dailyWater:+(wq*fq).toFixed(2)});
          }
        });
      }
      return ok(dOut,{meta:{total:dOut.length,page:1,totalPages:1}});
    }
    if(path==='/countries') return ok(countries);
    if(path==='/sites') return ok(q.country_id?sites.filter(function(s){return s.countryId===q.country_id;}):sites);
    if(path==='/farm-areas') return ok(q.site_id?areas.filter(function(a){return a.siteId===q.site_id;}):areas);
    if(path==='/fields'){ var fk=geoKeys(), fst=geoStore(); return ok(fields.map(function(f){ var e=fst[f.id]||{}; return Object.assign({},f,{keyId:fk[f.id],subtypeCode:e.subtype||null,gisZoneId:f.gis_zone_id||null,gisFarmCode:f.gis_farm_code||null,gisGlobalId:f.gis_external_id||null,hasShape:!!e.geometry}); })); }
    if(path==='/crops') return ok(CROPS.map(function(c,i){return {id:'crop'+i,name:c};}));
    if(path==='/field-types') return ok([{id:'ft1',name:'Greenhouse'},{id:'ft2',name:'Nethouse'},{id:'ft3',name:'PIVOT'}]);
    if(path==='/seasons') return ok(SEASONS);
    if(path==='/assignments/my-access') return ok({isFullAccess:true,siteIds:null});
    if(path==='/organization'){ var orgSt; try{ orgSt=JSON.parse(localStorage.getItem('agro_demo_org_v1')||'null'); }catch(e){ orgSt=null; } orgSt=orgSt||{id:'org1',name:'Al Maha Farm',settings:{default_site:'c7s1'}};
      if(method==='PUT'&&reqBody){ if(reqBody.name) orgSt.name=String(reqBody.name).slice(0,120); if(reqBody.settings&&typeof reqBody.settings==='object') orgSt.settings=Object.assign({},orgSt.settings,reqBody.settings); try{ localStorage.setItem('agro_demo_org_v1',JSON.stringify(orgSt)); }catch(e){} }
      return ok(orgSt); }
    if(path==='/gis/arcgis/connections'){
      if(method==='POST'){ var c={id:'layer1',name:REPORT.layer.name,source_url:(reqBody&&reqBody.url||'').replace(/\/\d+\/?$/,''),layer_index:21,attribute_mapping:reqBody&&reqBody.mapping||REPORT.mapping,sync_status:'synced',linked_features:0,synced_features:0,created:!CONN.length}; CONN=[c]; return ok(c); }
      return ok(CONN);
    }
    if(path==='/gis/arcgis/inspect'){ REPORT.url=reqBody&&reqBody.url||''; if(reqBody&&reqBody.mapping) for(var m in reqBody.mapping) if(reqBody.mapping[m]) REPORT.mapping[m]=reqBody.mapping[m]; return ok(REPORT); }
    if(/^\/gis\/layers\/[^/]+\/sync$/.test(path)) return ok({added:412,updated:0,removed:0});
    if(/^\/gis\/layers\/[^/]+\/auto-link$/.test(path)){ if(CONN[0]){CONN[0].linked_features=410;CONN[0].synced_features=412;CONN[0].last_synced_at=new Date().toISOString();} return ok({linked:410,created:39,skipped:2}); }
    if(path==='/gis/arcgis/link-issues') return ok([{issue:'duplicate_feature_keys',zone_id:'DB',farm_code:'DB-GH-07',occurrences:2},{issue:'feature_not_linked',zone_id:'KE',farm_code:'KE-PV-02',occurrences:1}]);
    if(path==='/gis/sites/forms'){
      var sz=(q.zone_id||'').toUpperCase(), ss=(q.site_code||'').toUpperCase();
      return ok({key:sz+'|'+ss,site:{site_id:'c7s1',site_name:'Site '+ss,zone_code:sz,zone_name:sz},field_count:9,fields:[],
        forms:[{form_id:'7c774b7b-8363-5887-b013-736ed63651b8',form_key:'harvest.entry',title_en:'Harvest Entry',title_ar:'إدخال الحصاد',record_count:42},
               {form_id:'3f2e6c1d-0a9b-5c4d-8e7f-1a2b3c4d5e6f',form_key:'ipm.pesticide_spray',title_en:'Pesticide — Spray',title_ar:'المبيدات — رش',record_count:17},
               {form_id:'0b7d1c2e-6f3a-5b4c-9d8e-2f1a0b9c8d7e',form_key:'ecph.entry',title_en:'EC/pH Entry',title_ar:'إدخال EC/pH',record_count:63}]});
    }
    if(path==='/gis/features/forms'){
      var z=(q.zone_id||'MH').toUpperCase(), code=(q.farm_code||'MH-GH-01').toUpperCase();
      return ok({features:[{feature_id:'g1',global_id:'{9F1C-DEMO}',zone_id:z,farm_code:code}],
        fields:[{field_id:'c7s1a0f1',field_name:code,zone_code:z,site_name:'Site 1',farm_area_name:'Greenhouse',gis_link_key:z+'|'+code}],
        forms:[{form_id:'7c774b7b-8363-5887-b013-736ed63651b8',form_key:'harvest.entry',title_en:'Harvest Entry',title_ar:'إدخال الحصاد',record_count:3,
                 records:ROWS.slice(0,3).map(function(r){return {record_id:'6a'+r.id+'0000-0000-4000-8000-000000000000'.slice(0,0)+r.id,record_date:r.date,values:{date:r.date,total_quantity:r.quantity,notes:r.notes}};})},
               {form_id:'3f2e6c1d-0a9b-5c4d-8e7f-1a2b3c4d5e6f',form_key:'ipm.pesticide_spray',title_en:'Pesticide — Spray',title_ar:'المبيدات — رش',record_count:2,
                 records:ROWS.slice(0,2).map(function(r){return {record_id:r.id,record_date:r.application_date,values:{product_name:r.product_name,dosage:r.dosage,cost:r.cost}};})}]});
    }
    return {success:true,data:ROWS,pagination:{total:ROWS.length,page:1,limit:50}};
  }
  var isApi=function(u){return /\/api\/v1\//.test(u);};
  var of=window.fetch;
  /* The structures layer is public, so the demo reads the real polygons straight
     from ArcGIS (read-only queries) and decodes its coded values. Offline, or if
     the service does not answer, the built-in sample polygons are used instead. */
  var LIVE_LAYER='https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21';
  var LIVE=null, META=null;
  var DEMO_META={name:'Agro_Structures',drawingInfo:null,fields:[],types:[]};
  var j=function(u){ return of(u).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }); };
  function race(p,ms){ return Promise.race([p,new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); },ms); })]); }
  function liveMeta(){
    if(META) return META;
    META=race(j(LIVE_LAYER+'?f=json'),12000).then(function(m){
      if(!m||m.error) throw new Error('meta');
      return {name:m.name,geometryType:m.geometryType,objectIdField:m.objectIdField||'OBJECTID',maxRecordCount:m.maxRecordCount,
        drawingInfo:m.drawingInfo&&m.drawingInfo.renderer?{renderer:m.drawingInfo.renderer,transparency:Number(m.drawingInfo.transparency)||0}:null,
        typeIdField:m.typeIdField||null,types:(m.types||[]).map(function(t){return {id:t.id,name:t.name};}),
        fields:(m.fields||[]).map(function(f){return {name:f.name,alias:f.alias||f.name,type:f.type,domain:f.domain&&f.domain.codedValues?f.domain.codedValues.map(function(c){return {code:c.code,name:c.name};}):null};})};
    }).catch(function(){
      /* Not reachable from here (e.g. inside a page that may not call ArcGIS): the copy shipped with the app. */
      return of('./agro_structures.meta.json').then(function(r){ if(!r.ok) throw new Error('no copy'); return r.json(); }).catch(function(){ META=null; return null; });
    });
    return META;
  }
  /* Raw values are kept (the layer's renderer matches on its codes); labels are decoded on screen. */
  function liveLayer(){
    if(LIVE) return LIVE;
    var all=[];
    function page(off){
      return j(LIVE_LAYER+'/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset='+off+'&resultRecordCount=2000').then(function(fc){
        var fs=(fc&&fc.features)||[]; all=all.concat(fs);
        var more=fc&&(fc.exceededTransferLimit||(fc.properties&&fc.properties.exceededTransferLimit));
        return (more&&fs.length&&off<50000)?page(off+fs.length):all;
      });
    }
    LIVE=race(page(0),30000).then(function(fs){
      if(!fs.length) throw new Error('empty');
      fs.forEach(function(f,i){ if(f.id===undefined) f.id=(f.properties&&f.properties.OBJECTID)||i; });
      return {type:'FeatureCollection',features:fs,_live:true};
    }).catch(function(){
      /* The copy of the real layer shipped with the app (read from ArcGIS on the date in its name), else the samples. */
      return of('./agro_structures.geojson').then(function(r){ if(!r.ok) throw new Error('no copy'); return r.json(); })
        .then(function(fc){ if(!fc||!(fc.features||[]).length) throw new Error('empty'); fc.features.forEach(function(f,i){ if(f.id===undefined) f.id=(f.properties&&f.properties.OBJECTID)||i; }); fc._snapshot=true; return fc; })
        .catch(function(){ LIVE=null; return EMPTYFC; });
    });
    return LIVE;
  }
  /* Speed: pages never wait for the network. The copy shipped with the app answers at once;
     the live read runs in the background and is used from the next request once it has arrived. */
  var COPY=null, LIVE_OK=false, COPY_META=null;
  function copyLayer(){
    if(COPY) return COPY;
    COPY=of('./agro_structures.geojson').then(function(r){ if(!r.ok) throw new Error('no copy'); return r.json(); })
      .then(function(fc){ if(!fc||!(fc.features||[]).length) throw new Error('empty'); fc.features.forEach(function(f,i){ if(f.id===undefined) f.id=(f.properties&&f.properties.OBJECTID)||i; }); fc._snapshot=true; return fc; })
      .catch(function(e){ COPY=null; throw e; });
    return COPY;
  }
  function copyMeta(){
    if(!COPY_META) COPY_META=of('./agro_structures.meta.json').then(function(r){ if(!r.ok) throw new Error('no copy'); return r.json(); }).catch(function(){ COPY_META=null; return null; });
    return COPY_META;
  }
  function fastLayer(){
    if(LIVE_OK) return LIVE;
    var bg=function(){ liveLayer().then(function(fc){ if(fc&&fc._live) LIVE_OK=true; }); };
    if(typeof requestIdleCallback==='function') requestIdleCallback(bg,{timeout:4000}); else setTimeout(bg,1500);
    return copyLayer().catch(function(){ return liveLayer(); });
  }
  function jsonRes(x){ return new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}}); }

  /* Satellite imagery on this device (demo / APK have no server). The
     configuration ID is typed by the user in Settings → API keys → Satellite
     imagery and kept only in this device's storage — never in the app code.
     Tiles then come straight from Sentinel Hub (or Copernicus Data Space) with
     the same index scripts the server uses. */
  var SAT_KEY='agro_device_sentinel';
  var SAT_URL={'sentinel-hub':'https://services.sentinel-hub.com/ogc/','copernicus':'https://sh.dataspace.copernicus.eu/ogc/'};
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var RAMPS={VEG:[[-0.2,'0xa50026'],[0,'0xd73027'],[0.1,'0xf46d43'],[0.2,'0xfdae61'],[0.3,'0xfee08b'],[0.4,'0xd9ef8b'],[0.5,'0xa6d96a'],[0.6,'0x66bd63'],[0.7,'0x1a9850'],[0.9,'0x006837']],
    WATER:[[-0.8,'0x008000'],[0,'0xFFFFFF'],[0.8,'0x0000CC']],
    MOIST:[[-0.6,'0x8c2d04'],[-0.3,'0xcc4c02'],[-0.1,'0xfe9929'],[0,'0xfee391'],[0.1,'0xc7e9b4'],[0.2,'0x7fcdbb'],[0.4,'0x2c7fb8'],[0.6,'0x253494']],
    STRESS:[[0.2,'0x253494'],[0.6,'0x41b6c4'],[1,'0xffffcc'],[1.4,'0xfd8d3c'],[2,'0xbd0026']],
    SOIL:[[-0.6,'0x1a9850'],[-0.2,'0x91cf60'],[0,'0xfee08b'],[0.15,'0xfc8d59'],[0.3,'0xd73027'],[0.6,'0x7f0000']]};
  var IDX={TRUE_COLOR:{rgb:['B04','B03','B02']},FALSE_COLOR:{rgb:['B08','B04','B03']},SWIR:{rgb:['B12','B8A','B04']},
    NDVI:{b:['B04','B08'],e:'(s.B08 - s.B04) / (s.B08 + s.B04)',r:'VEG'},SAVI:{b:['B04','B08'],e:'1.5 * (s.B08 - s.B04) / (s.B08 + s.B04 + 0.5)',r:'VEG'},
    NDWI:{b:['B03','B08'],e:'(s.B03 - s.B08) / (s.B03 + s.B08)',r:'WATER'},NDMI:{b:['B08','B11'],e:'(s.B08 - s.B11) / (s.B08 + s.B11)',r:'MOIST'},
    NDII:{b:['B08','B11'],e:'(s.B08 - s.B11) / (s.B08 + s.B11)',r:'MOIST'},MSI:{b:['B08','B11'],e:'s.B11 / s.B08',r:'STRESS'},
    BSI:{b:['B02','B04','B08','B11'],e:'((s.B11 + s.B04) - (s.B08 + s.B02)) / ((s.B11 + s.B04) + (s.B08 + s.B02))',r:'SOIL'}};
  function vizScript(key){ var d=IDX[key]||IDX.TRUE_COLOR;
    if(d.rgb){ return '//VERSION=3\nfunction setup(){return{input:'+JSON.stringify(d.rgb.concat('dataMask'))+',output:{bands:4}}}\nfunction evaluatePixel(s){return [2.5*s.'+d.rgb[0]+', 2.5*s.'+d.rgb[1]+', 2.5*s.'+d.rgb[2]+', s.dataMask];}'; }
    var ramp=RAMPS[d.r].map(function(x){return '['+x[0]+','+x[1]+']';}).join(',');
    return '//VERSION=3\nconst viz = new ColorRampVisualizer(['+ramp+']);\nfunction setup(){return{input:'+JSON.stringify(d.b.concat('dataMask'))+',output:{bands:4}}}\nfunction evaluatePixel(s){const v='+d.e+'; if(!isFinite(v)) return [0,0,0,0]; const c=viz.process(v); return [c[0],c[1],c[2],s.dataMask];}'; }
  function b64(t){ return btoa(unescape(encodeURIComponent(t))); }
  /* Organisation keys built into this site at publish time (GitHub secrets); never in the code. */
  var ORG_KEYS=window.__AGRO_DEMO_KEYS__||{};
  var OWM_KEY='agro_device_openweather';
  function owmKey(){ try{ return localStorage.getItem(OWM_KEY)||ORG_KEYS.owm||''; }catch(e){ return ORG_KEYS.owm||''; } }
  function satCfg(){ try{ var c=JSON.parse(localStorage.getItem(SAT_KEY)||'null'); return c&&UUID.test(c.id)?c:null; }catch(e){ return null; } }
  function satTileUrl(u){ var c=satCfg(); if(!c) return null;
    var p={}; (u.split('?')[1]||'').split('&').forEach(function(kv){ var a=kv.split('='); if(a[0]) p[decodeURIComponent(a[0]).toUpperCase()]=decodeURIComponent(a[1]||''); });
    var o={SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:c.layer||'TRUE_COLOR',STYLES:'',FORMAT:'image/png',TRANSPARENT:'true',
      WIDTH:p.WIDTH||'256',HEIGHT:p.HEIGHT||'256',BBOX:p.BBOX||'',CRS:p.CRS||p.SRS||'EPSG:3857',SHOWLOGO:'false',EVALSCRIPT:b64(vizScript(p.INDEX||'TRUE_COLOR'))};
    if(p.TIME) o.TIME=p.TIME; if(p.MAXCC) o.MAXCC=p.MAXCC; if(p.GEOMETRY) o.GEOMETRY=p.GEOMETRY; if(p.PRIORITY) o.PRIORITY=p.PRIORITY;
    return SAT_URL[c.service||'sentinel-hub']+'wms/'+c.id+'?'+Object.keys(o).map(function(k){return k+'='+encodeURIComponent(o[k]);}).join('&'); }
  function satTest(id,service){
    id=String(id||'').trim(); if(id==='USE_SAVED'){ var cc=satCfg(); id=cc?cc.id:''; }
    if(!UUID.test(id)) return Promise.resolve({success:false,message:'The configuration ID must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',layers:[],service:service});
    var order=service==='copernicus'?['copernicus','sentinel-hub']:['sentinel-hub','copernicus'];
    function tryOne(i,last){ if(i>=order.length) return {success:false,message:'Could not read the configuration ('+last+').',layers:[],service:service};
      var svc=order[i];
      return of(SAT_URL[svc]+'wms/'+id+'?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0').then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }).then(function(x){
        var re=/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>/g,m,ls=[]; while((m=re.exec(x))) ls.push({id:m[1].trim(),title:(m[2]||m[1]).trim()});
        if(!ls.length) throw new Error('no layers');
        return {success:true,message:'Connected ('+(svc==='copernicus'?'Copernicus Data Space':'Sentinel Hub')+') · '+ls.length+' layers',layers:ls,service:svc,id:id};
      }).catch(function(e){ return tryOne(i+1,e.message||'network'); }); }
    return Promise.resolve(tryOne(0,''));
  }
  function pickLayer(ls){ var ids=ls.map(function(l){return l.id;});
    return ids.filter(function(x){return /^TRUE[_-]?COLOR$/i.test(x);})[0]||ids.filter(function(x){return /TRUE|NATURAL|L2A|NDVI/i.test(x);})[0]||ids[0]||'TRUE_COLOR'; }
  /* Index range encoded in the PNG for the time series (value = lo + (hi-lo) * R/255). */
  var SERIES_RANGE={NDVI:[-1,1],SAVI:[-1,1],NDWI:[-1,1],NDMI:[-1,1],NDII:[-1,1],BSI:[-1,1],MSI:[0,3]};
  function satSeries(b){
    var c=satCfg(), idx=IDX[b.index]; if(!idx||idx.rgb) return Promise.resolve([]);
    var m=String(b.geometry||'').match(/-?\d+(\.\d+)?\s+-?\d+(\.\d+)?/g)||[]; if(!m.length) return Promise.resolve([]);
    var xs=[],ys=[]; m.forEach(function(t){ var a=t.trim().split(/\s+/).map(Number); xs.push(a[0]); ys.push(a[1]); });
    var bbox=[Math.min.apply(null,xs),Math.min.apply(null,ys),Math.max.apply(null,xs),Math.max.apply(null,ys)];
    var rg=SERIES_RANGE[b.index]||[-1,1];
    var script='//VERSION=3\nfunction setup(){return{input:'+JSON.stringify(idx.b.concat('dataMask'))+',output:{bands:4}}}\nfunction evaluatePixel(s){const v='+idx.e+'; if(!isFinite(v)||!s.dataMask) return [0,0,0,0]; const t=Math.max(0,Math.min(1,(v-('+rg[0]+'))/('+(rg[1]-rg[0])+'))); return [t,t,t,1];}';
    var base=SAT_URL[c.service||'sentinel-hub'];
    var wfs=base+'wfs/'+c.id+'?SERVICE=WFS&REQUEST=GetFeature&TYPENAMES=DSS2&OUTPUTFORMAT=application/json&SRSNAME=EPSG:3857&MAXFEATURES=200&BBOX='+bbox.join(',')+'&TIME='+b.from+'/'+b.to+'&MAXCC='+(b.maxcc||30);
    return of(wfs).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(function(g){
      var dates={}; (g.features||[]).forEach(function(f){ var d=String((f.properties||{}).date||'').slice(0,10); if(d) dates[d]=1; });
      var list=Object.keys(dates).sort(); if(list.length>36){ var st=list.length/36, pick=[]; for(var i=0;i<36;i++) pick.push(list[Math.floor(i*st)]); list=pick; }
      return Promise.all(list.map(function(d){
        var o={SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:c.layer||'TRUE_COLOR',STYLES:'',FORMAT:'image/png',TRANSPARENT:'true',WIDTH:'96',HEIGHT:'96',
          CRS:'EPSG:3857',BBOX:bbox.join(','),TIME:d+'/'+d,MAXCC:String(b.maxcc||30),GEOMETRY:b.geometry,SHOWLOGO:'false',EVALSCRIPT:b64(script)};
        var u=base+'wms/'+c.id+'?'+Object.keys(o).map(function(k){return k+'='+encodeURIComponent(o[k]);}).join('&');
        return of(u).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); }).then(function(bl){ return createImageBitmap(bl); }).then(function(im){
          var cv=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(im.width,im.height):Object.assign(document.createElement('canvas'),{width:im.width,height:im.height}); var cx=cv.getContext('2d'); cx.drawImage(im,0,0);
          var px=cx.getImageData(0,0,im.width,im.height).data, n=0, sum=0, mn=Infinity, mx=-Infinity;
          for(var k=0;k<px.length;k+=4){ if(px[k+3]<200) continue; var v=rg[0]+(rg[1]-rg[0])*px[k]/255; n++; sum+=v; if(v<mn) mn=v; if(v>mx) mx=v; }
          return n?{date:d,mean:Math.round(sum/n*1000)/1000,min:Math.round(mn*1000)/1000,max:Math.round(mx*1000)/1000,pixels:n}:null;
        }).catch(function(){ return null; });
      })).then(function(rows){ return rows.filter(Boolean); });
    });
  }
  window.__devSat={cfg:satCfg,tileUrl:satTileUrl};
  /* First visit on a device: set up satellite imagery from the organisation's configuration ID. */
  try{ if(!satCfg()&&ORG_KEYS.sat&&UUID.test(ORG_KEYS.sat)){ satTest(ORG_KEYS.sat,ORG_KEYS.satService||'sentinel-hub').then(function(t){ if(t&&t.success&&!satCfg()) localStorage.setItem(SAT_KEY,JSON.stringify({id:t.id,service:t.service,label:'Organisation',layer:pickLayer(t.layers)})); }).catch(function(){}); } }catch(e){}
  /* Full import of Agro_Structures on this device (same rules as the server):
     ZONE_ID → zone, ZONE_ID + Site_Code / SITE → site ("Not Applicable" → Unassigned),
     Structure_Type → farm area and subtype, ZONE_ID + Farm_Code → field (KeyID ZONE_ID-Farm_Code). */
  var ST_TYPES=[[1000,'Greenhouse',/green/],[1001,'Nethouse',/net|shade/],[1002,'Glasshouse',/glass/],[1003,'Retractable Roof Houses',/retract/],[1004,'Cravo',/cravo/],[1005,'Dates Farm',/date|palm/],[1006,'PIVOT',/pivot/],[1007,'Farm Plots',/plot|open|field/]];
  function stCode(raw,dom){ if(raw===null||raw===undefined||String(raw).trim()==='') return null; var v=String(raw).trim();
    if(/^\d+$/.test(v)&&ST_TYPES.some(function(t){return t[0]===+v;})) return +v; var l=((dom&&dom[v])||v).toLowerCase();
    var h=ST_TYPES.filter(function(t){return t[2].test(l);})[0]; return h?h[0]:null; }
  function codedOf(meta,name){ var m={}; if(!meta) return m; (meta.fields||[]).forEach(function(f){ if(f.name===name&&f.domain) f.domain.forEach(function(c){ m[String(c.code)]=String(c.name); }); });
    if(meta.typeIdField===name) (meta.types||[]).forEach(function(t){ m[String(t.id)]=String(t.name); }); return m; }
  var COUNTRY_Z={1:['UAE-NA','UAE – unassigned'],2:['RS','Serbia'],3:['MA','Morocco'],4:['MR','Mauritania'],5:['ET','Ethiopia'],8:['ET','Ethiopia'],6:['SA','Saudi Arabia'],9:['SA','Saudi Arabia'],7:['TZ','Tanzania'],10:['SL','Sierra Leone']};
  var COUNTRY_BOX=[['1',[51,22.4,56.5,26.4]],['2',[18.8,42.2,23.1,46.2]],['4',[-17.2,14.6,-4.8,21.3]],['3',[-17.2,21.3,-0.9,36]],['6',[34.5,16.3,55.7,32.2]],['5',[33,3.4,48,15]],['7',[29.3,-11.8,40.5,-0.9]],['10',[-13.4,6.9,-10.2,10]]];
  function countryAt(g){ var r=g.type==='Polygon'?g.coordinates[0]:(g.coordinates[0]||[])[0]; if(!r||!r.length) return null; var x=0,y=0; r.forEach(function(c){x+=c[0];y+=c[1];}); x/=r.length; y/=r.length;
    var h=COUNTRY_BOX.filter(function(b){ var q=b[1]; return x>=q[0]&&x<=q[2]&&y>=q[1]&&y<=q[3]; })[0]; return h?h[0]:null; }
  /* Every field that has ZONE_ID + Farm_Code gets its shape from Agro_Structures (no new fields):
     the link is the Farm_Code, the drawing is saved in the system and kept if edited here. */
  var LINKED=null, AUTO_KEY='agro_demo_autoimport_v1';
  function autoLink(){
    if(LINKED) return LINKED;
    var already=null; try{ already=localStorage.getItem(AUTO_KEY); }catch(e){}
    if(already){
      /* Imported before on this device: the shapes are saved here, so pages answer at once.
         Shapes still missing are linked quietly after the page has drawn. */
      LINKED=Promise.resolve();
      setTimeout(function(){ linkShapes(fastLayer()); },2500);
      return LINKED;
    }
    LINKED=linkShapes(fastLayer());
    LINKED=Promise.race([LINKED,new Promise(function(r){ setTimeout(r,8000); })]);
    return LINKED;
  }
  function linkShapes(src){
    return src.then(function(fc){
      /* First run on this device: import the whole Agro_Structures layer (every feature, drawn), like
         "Import from ArcGIS". Fields link by ZONE_ID + Farm_Code; the sample fields keep their readings. */
      var done=null; try{ done=localStorage.getItem(AUTO_KEY); }catch(e){}
      if(!done&&fc&&(fc.features||[]).length){
        return Promise.resolve(fc._live?liveMeta():copyMeta()).catch(function(){return null;}).then(function(meta){
          try{ var rep=demoImport(fc,meta||DEMO_META,{buildParents:true}); localStorage.setItem(AUTO_KEY,JSON.stringify({at:new Date().toISOString(),features:rep.features,shapes:rep.shapes.imported,source:fc._live?'live':'copy'})); }catch(e){}
          return fc;
        });
      }
      return fc;
    }).then(function(fc){
      var fs=(fc&&fc.features)||[]; if(!fs.length) return;
      var by={}; fs.forEach(function(f){ var p=f.properties||{}, z=String(p.ZONE_ID||'').trim().toUpperCase(), c=String(p.Farm_Code||'').trim().toUpperCase(); if(z&&c&&f.geometry) by[z+'|'+c]=f; });
      var st=geoStore(), now=new Date().toISOString(), n=0;
      fields.forEach(function(x){ if(!x.gis_zone_id||!x.gis_farm_code) return; var e=st[x.id];
        if(e&&e.geometry) return;
        var f=by[String(x.gis_zone_id).toUpperCase()+'|'+String(x.gis_farm_code).toUpperCase()]; if(!f) return;
        var g=f.geometry; st[x.id]=e||{history:[]}; st[x.id].geometry=g.type==='Polygon'?{type:'MultiPolygon',coordinates:[g.coordinates]}:g; st[x.id].src='arcgis'; st[x.id].at=now;
        var sc=stCode((f.properties||{}).Structure_Type,null); if(sc) st[x.id].subtype=sc;
        if(!x.gis_external_id&&f.properties&&f.properties.GlobalID) x.gis_external_id=f.properties.GlobalID;
        (st[x.id].history=st[x.id].history||[]).push({id:Date.now()+n,operation:'import',edited_at:now,edited_by_name:'ArcGIS link (Farm_Code)',area_ha:geoArea(st[x.id].geometry)}); n++; });
      if(n) geoSave(st);
    }).catch(function(){});
  }
  function demoImport(fc,meta,opt){
    var C=JSON.parse(JSON.stringify(countries)),S=JSON.parse(JSON.stringify(sites)),A=JSON.parse(JSON.stringify(areas)),Fl=JSON.parse(JSON.stringify(fields));
    var st=JSON.parse(JSON.stringify(geoStore())), now=new Date().toISOString(), n=Date.now().toString(36);
    var im=null; try{ im=JSON.parse(localStorage.getItem(IMP_KEY)||'null'); }catch(e){} im=im||{countries:[],sites:[],areas:[],fields:[],moves:{}};
    var siteDom=codedOf(meta,'SITE'), stDom=codedOf(meta,'Structure_Type');
    var rep={dryRun:!!opt.dryRun,layer:{name:'Agro_Structures',id:21,live:!!fc._live},features:0,zones:{created:0,matched:0},sites:{created:0,matched:0},farmAreas:{created:0,matched:0},
      fields:{created:0,matched:0,adopted:0,moved:0,rekeyed:0},shapes:{imported:0,keptEdited:0,repaired:0},parents:{farm_area:0,site:0,zone:0},bySubtype:{},
      issues:{missingKeys:0,noGeometry:0,duplicates:[],notApplicable:0,unknownStructure:[],noFarmCode:0,noZone:0,noZoneByCountry:{},countryFromLocation:0},overlaps:[]};
    var seen={}, unk={}, cz={}, cs={}, ca={}, seq=0, uid=function(p){ seq++; return 'imp'+p+n+seq; };
    var hist=function(id,op){ st[id]=st[id]||{history:[]}; (st[id].history=st[id].history||[]).push({id:Date.now()+seq++,operation:op,edited_at:now,edited_by_name:'Demo Manager',area_ha:geoArea(st[id].geometry)}); };
    (fc.features||[]).forEach(function(ft){
      var p=ft.properties||{}, g=ft.geometry, cl=function(v){ var t=v===null||v===undefined?'':String(v).trim(); return /^<?null>?$|^none$|^n\/a$|^-$/i.test(t)?'':t; };
      if(!g||(g.type!=='Polygon'&&g.type!=='MultiPolygon')){ rep.issues.noGeometry++; return; }
      var zone=cl(p.ZONE_ID).toUpperCase(), zoneName=zone, oid=cl(p.OBJECTID);
      if(!zone){ var ctry=cl(p.Country); if(!ctry||ctry==='0'){ ctry=countryAt(g)||''; if(ctry) rep.issues.countryFromLocation++; } var cz2=COUNTRY_Z[ctry]||['UNASSIGNED','Unassigned']; zone=cz2[0]; zoneName=cz2[1]; rep.issues.noZone++; rep.issues.noZoneByCountry[zoneName]=(rep.issues.noZoneByCountry[zoneName]||0)+1; }
      var farm=cl(p.Farm_Code), ks='farm_code';
      if(!farm){ rep.issues.noFarmCode++; if(cl(p.Farm_Name)){ farm=cl(p.Farm_Name); ks='farm_name'; } else if(cl(p.ProjectCode)){ farm=cl(p.ProjectCode); ks='project_code'; } else if(oid){ farm='OID'+oid; ks='object_id'; } }
      if(!farm){ rep.issues.missingKeys++; return; }
      farm=farm.replace(/\s+/g,' ');
      var key=geoFieldKey(zone,farm); if(seen[key]){ rep.issues.duplicates.push(key); farm=farm+'-'+(cl(p.ProjectCode)||('OID'+oid)); key=geoFieldKey(zone,farm); } seen[key]=1; rep.features++;
      var sRaw=p.SITE===null||p.SITE===undefined?'':String(p.SITE).trim(), sLab=siteDom[sRaw]||sRaw, sCode=cl(p.Site_Code);
      var un=/not\s*applic|^n\s*\/?\s*a$|^none$/i.test(sLab)||(!sLab&&!sCode); if(un) rep.issues.notApplicable++;
      var sName=un?'Unassigned':(/^\d+$/.test(sLab)?'Site '+sLab:(sLab||sCode||'Site')), sKey=un?'__U':(sCode||sName).toUpperCase();
      var sc=stCode(p.Structure_Type,stDom), aName=sc?ST_TYPES.filter(function(t){return t[0]===sc;})[0][1]:((stDom[String(p.Structure_Type)]||p.Structure_Type||'Other')+'');
      if(p.Structure_Type&&!sc) unk[aName]=1;
      if(sc){ rep.bySubtype[sc]=rep.bySubtype[sc]||{name:aName,count:0}; rep.bySubtype[sc].count++; }
      // zone
      var z=cz[zone]; if(!z){ z=C.filter(function(c){return String(c.code).toUpperCase()===zone;})[0];
        if(z) rep.zones.matched++; else { z={id:uid('c'),name:zoneName||zone,code:zone}; C.push(z); im.countries.push(z); rep.zones.created++; } cz[zone]=z; }
      // site
      var sk=z.id+'|'+sKey, s=cs[sk]; if(!s){ s=S.filter(function(x){return x.countryId===z.id&&((!un&&x.gis_site_code&&x.gis_site_code.toUpperCase()===sKey)||x.name.toLowerCase()===sName.toLowerCase());})[0];
        if(s){ rep.sites.matched++; if(!un&&!s.gis_site_code) s.gis_site_code=sKey; } else { s={id:uid('s'),name:sName,countryId:z.id,country_id:z.id,location:zone,gis_site_code:un?null:sKey}; S.push(s); im.sites.push(s); rep.sites.created++; }
        st[s.id]=st[s.id]||{history:[]}; if(!st[s.id].subtype) st[s.id].subtype=un?9:1; cs[sk]=s; }
      // farm area
      var ak=s.id+'|'+(sc||aName), a=ca[ak]; if(!a){ a=A.filter(function(x){return x.siteId===s.id&&((sc&&st[x.id]&&st[x.id].subtype===sc)||x.name.toLowerCase()===aName.toLowerCase());})[0];
        if(a) rep.farmAreas.matched++; else { a={id:uid('a'),name:aName,siteId:s.id,site_id:s.id}; A.push(a); im.areas.push(a); rep.farmAreas.created++; }
        st[a.id]=st[a.id]||{history:[]}; if(!st[a.id].subtype) st[a.id].subtype=sc; ca[ak]=a; }
      // field
      var gid=cl(p.GlobalID), f=(gid&&Fl.filter(function(x){return x.gis_external_id===gid;})[0])||Fl.filter(function(x){return x.gis_zone_id&&String(x.gis_zone_id).toUpperCase()===zone&&String(x.gis_farm_code||'').toUpperCase()===farm.toUpperCase();})[0];
      if(f){ rep.fields.matched++; if(f.farmAreaId!==a.id){ f.farmAreaId=a.id; f.farm_area_id=a.id; im.moves[f.id]=a.id; rep.fields.moved++; } }
      else { var nm=cl(p.Farm_Name)||farm; if(Fl.some(function(x){return x.farmAreaId===a.id&&x.name.toLowerCase()===nm.toLowerCase();})) nm=farm;
        f={id:uid('f'),name:nm,farmAreaId:a.id,farm_area_id:a.id,area:null,gis_zone_id:zone,gis_farm_code:farm,gis_external_id:gid||null}; Fl.push(f); im.fields.push(f); rep.fields.created++; }
      st[f.id]=st[f.id]||{history:[]}; if(sc) st[f.id].subtype=sc;
      if(st[f.id].geometry&&st[f.id].src==='agrocloud'&&!opt.overwrite){ rep.shapes.keptEdited++; return; }
      st[f.id].geometry=g.type==='Polygon'?{type:'MultiPolygon',coordinates:[g.coordinates]}:g; st[f.id].src='arcgis'; st[f.id].at=now; hist(f.id,'import'); rep.shapes.imported++;
    });
    rep.issues.unknownStructure=Object.keys(unk);
    if(opt.buildParents){
      var pad={farm_area:0.00003,site:0.0001,zone:0.0002};
      [['farm_area',A,function(x){return Fl.filter(function(f){return f.farmAreaId===x.id;});}],['site',S,function(x){return A.filter(function(a){return a.siteId===x.id;});}],
       ['zone',C,function(x){return S.filter(function(s){return s.countryId===x.id;});}]].forEach(function(step){
        step[1].forEach(function(par){ var e=st[par.id]; if(e&&e.geometry&&e.src!=='arcgis') return;
          var kids=step[2](par).map(function(k){return st[k.id]&&st[k.id].geometry;}).filter(Boolean); if(!kids.length) return;
          var bb=[180,90,-180,-90]; kids.forEach(function(g){ var b=geoBBox(g); bb=[Math.min(bb[0],b[0]),Math.min(bb[1],b[1]),Math.max(bb[2],b[2]),Math.max(bb[3],b[3])]; });
          var d=pad[step[0]]; st[par.id]=st[par.id]||{history:[]}; st[par.id].geometry=geoRect(bb[0]-d,bb[1]-d,bb[2]-bb[0]+2*d,bb[3]-bb[1]+2*d); st[par.id].src='arcgis'; st[par.id].at=now;
          hist(par.id,'import'); rep.parents[step[0]]++; }); });
    }
    if(!opt.dryRun){
      [[countries,C],[sites,S],[areas,A],[fields,Fl]].forEach(function(pr){ pr[0].splice.apply(pr[0],[0,pr[0].length].concat(pr[1])); });
      geoSave(st); try{ localStorage.setItem(IMP_KEY,JSON.stringify(im)); }catch(e){}
    }
    return rep;
  }
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    // Weather (OpenWeatherMap) straight from the browser. Key: the one saved on this device, else the
    // organisation key built into this site from the GitHub secret DEMO_OPENWEATHER_API_KEY.
    var owmM=isApi(url)&&url.match(/\/(settings\/openweather(\/test|\/key)?|weather\/(status|current))(\?|$)/);
    if(owmM){
      var meth=(init&&init.method)||'GET', ob={}; try{ ob=init&&init.body?JSON.parse(init.body):{}; }catch(e){}
      var mask=function(k){ return k?k.slice(0,4)+'••••'+k.slice(-4):null; };
      var owmTry=function(k){ return of('https://api.openweathermap.org/data/2.5/weather?lat=24.45&lon=54.38&units=metric&appid='+encodeURIComponent(k)).then(function(r){ return r.ok?{success:true,message:'Connected to OpenWeatherMap'}:{success:false,message:r.status===401?'This key is not valid (yet). New keys can take up to 2 hours to work.':'OpenWeatherMap answered '+r.status}; }).catch(function(){ return {success:false,message:'OpenWeatherMap is not reachable'}; }); };
      if(owmM[1]==='settings/openweather/key'){ try{ localStorage.removeItem(OWM_KEY); }catch(e){} return Promise.resolve(jsonRes(ok({hasKey:!!owmKey(),keyMasked:mask(owmKey())}))); }
      if(owmM[1]==='settings/openweather/test'){ var tk=ob.apiKey==='USE_SAVED'?owmKey():String(ob.apiKey||'').trim(); return (tk?owmTry(tk):Promise.resolve({success:false,message:'Enter an API key first'})).then(function(t){ return jsonRes(ok(t)); }); }
      if(owmM[1]==='settings/openweather'&&meth==='PUT'){ var nk=String(ob.apiKey||'').trim(); if(nk){ try{ localStorage.setItem(OWM_KEY,nk); }catch(e){} } return Promise.resolve(jsonRes(ok({hasKey:!!owmKey(),keyMasked:mask(owmKey())}))); }
      if(owmM[1]==='settings/openweather') return Promise.resolve(jsonRes(ok({hasKey:!!owmKey(),keyMasked:mask(owmKey()),source:localStorage.getItem(OWM_KEY)?'device':(owmKey()?'organisation':null)})));
      if(owmM[1]==='weather/status') return Promise.resolve(jsonRes(ok({configured:!!owmKey()})));
      var k2=owmKey(); if(!k2) return Promise.resolve(new Response(JSON.stringify({success:false,error:{message:'No OpenWeatherMap key'}}),{status:400,headers:{'Content-Type':'application/json'}}));
      var qw={}; (url.split('?')[1]||'').split('&').forEach(function(kv){ var a=kv.split('='); if(a[0]) qw[a[0]]=decodeURIComponent(a[1]||''); });
      return of('https://api.openweathermap.org/data/2.5/weather?units=metric&lat='+encodeURIComponent(qw.lat)+'&lon='+encodeURIComponent(qw.lon)+'&appid='+encodeURIComponent(k2)).then(function(r){ if(!r.ok) throw new Error('OpenWeatherMap '+r.status); return r.json(); }).then(function(w){
        var m=w.main||{}; return jsonRes(ok({date:new Date().toISOString().slice(0,10),temperature:{max:m.temp_max,min:m.temp_min,avg:m.temp,feelsLike:m.feels_like},humidity:m.humidity,rainfall:(w.rain&&w.rain['1h'])||0,pressure:m.pressure,windSpeed:(w.wind||{}).speed,windDirection:(w.wind||{}).deg,clouds:(w.clouds||{}).all,description:((w.weather||[])[0]||{}).description||'',icon:((w.weather||[])[0]||{}).icon||''}));
      }).catch(function(e){ return new Response(JSON.stringify({success:false,error:{message:e.message}}),{status:502,headers:{'Content-Type':'application/json'}}); });
    }
    if(isApi(url)&&/\/settings\/sentinelhub(\/test)?(\?|$)/.test(url)&&init&&init.method&&init.method!=='GET'){
      var sb={}; try{ sb=init.body?JSON.parse(init.body):{}; }catch(e){}
      if(init.method==='DELETE'){ try{ localStorage.removeItem(SAT_KEY); }catch(e){} return Promise.resolve(jsonRes({success:true})); }
      return satTest(sb.instanceId,sb.service||'sentinel-hub').then(function(t){
        if(/\/test(\?|$)/.test(url)) return jsonRes(ok({success:t.success,message:t.message,layers:t.layers,service:t.service}));
        if(!t.success) return new Response(JSON.stringify({success:false,error:{message:t.message}}),{status:400,headers:{'Content-Type':'application/json'}});
        try{ localStorage.setItem(SAT_KEY,JSON.stringify({id:t.id,service:t.service,label:sb.label||null,layer:pickLayer(t.layers)})); }catch(e){}
        var c3=satCfg(); return jsonRes(ok({configured:true,idMasked:c3.id.slice(0,4)+'••••-••••-'+c3.id.slice(-4),service:c3.service,label:c3.label,layers:t.layers}));
      });
    }
    if(isApi(url)&&/\/satellite\/stats(\?|$)/.test(url)&&satCfg()){
      /* Real time series: the index over the area for each acquisition date, computed on this device from Sentinel-2 (WMS, clipped to the area). */
      var sb2={}; try{ sb2=init&&init.body?JSON.parse(init.body):{}; }catch(e){}
      return satSeries(sb2).then(function(rows){ return jsonRes(ok(rows)); }).catch(function(e){ return new Response(JSON.stringify({success:false,error:{message:'Sentinel-2: '+(e.message||'not reachable')}}),{status:502,headers:{'Content-Type':'application/json'}}); });
    }
    if(isApi(url)&&/\/satellite\/scenes(\?|$)/.test(url)&&satCfg()){
      /* Real acquisition dates from the catalogue (WFS); the sample list if it does not answer. */
      var c4=satCfg(), qq={}; (url.split('?')[1]||'').split('&').forEach(function(kv){ var a2=kv.split('='); if(a2[0]) qq[a2[0]]=decodeURIComponent(a2[1]||''); });
      var bb=(qq.bbox||'').split(',').map(Number);
      var wfs=SAT_URL[c4.service]+'wfs/'+c4.id+'?SERVICE=WFS&REQUEST=GetFeature&TYPENAMES=DSS2&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&MAXFEATURES=100&BBOX='+[bb[1],bb[0],bb[3],bb[2]].join(',')+'&TIME='+qq.from+'/'+qq.to+'&MAXCC='+(qq.maxcc||100);
      return of(wfs).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(function(g){
        var by={}; (g.features||[]).forEach(function(f){ var pr=f.properties||{}; var d=String(pr.date||'').slice(0,10); if(!d) return; var cl=Number(pr.cloudCoverPercentage); if(!by[d]) by[d]={date:d,cloud:isFinite(cl)?Math.round(cl):null,tiles:0,time:pr.time||null}; by[d].tiles++; if(isFinite(cl)&&(by[d].cloud===null||cl<by[d].cloud)) by[d].cloud=Math.round(cl); });
        return jsonRes(ok(Object.keys(by).sort().reverse().map(function(k){return by[k];})));
      }).catch(function(){ return jsonRes(body(url,'GET',null)); });
    }
    if(isApi(url)&&/\/geo\/import\/arcgis(\?|$)/.test(url)&&init&&init.method==='POST'){
      var ib={}; try{ ib=init.body?JSON.parse(init.body):{}; }catch(e){}
      return Promise.all([liveLayer(),liveMeta()]).then(function(r){ var fc=r[0]||EMPTYFC, rp=demoImport(fc,r[1]||DEMO_META,ib); rp.layer.source=fc._live?'live':fc._snapshot?'copy':'none'; return jsonRes(ok(rp)); });
    }
    if(isApi(url)&&/\/geo\/layers(\?|$)/.test(url)&&(!init||!init.method||init.method==='GET')){
      return autoLink().then(function(){ return jsonRes(body(url,'GET',null)); });
    }
    if(isApi(url)&&/\/(countries|sites|farm-areas|ipm\/field-overview|geo\/model)(\?|$)/.test(url)&&(!init||!init.method||init.method==='GET')){
      return autoLink().then(function(){ return jsonRes(body(url,'GET',null)); });
    }
    if(isApi(url)&&/\/fields(\?|$)/.test(url)&&(!init||!init.method||init.method==='GET')){
      return autoLink().then(function(){ return jsonRes(body(url,'GET',null)); });
    }
    if(isApi(url)&&/\/gis\/layers\/demo-struct\/features(\?|$)/.test(url)){
      return fastLayer().then(function(fc){ return jsonRes(ok(fc)); });
    }
    /* The layer name says where the polygons came from (the shipped copy first, live once it has arrived). */
    if(isApi(url)&&/\/gis\/layers(\?|$)/.test(url)&&(!init||!init.method||init.method==='GET')){
      return fastLayer().then(function(fc){
        var live=fc&&fc._live;
        return jsonRes(ok([{id:'demo-struct',name:live?'Agro_Structures (ArcGIS Online · live)':(fc&&fc._snapshot)?'Agro_Structures (ArcGIS copy · 15 Nov 2026)':'Agro_Structures (ArcGIS not reachable)',
          sourceType:'arcgis_feature_service',featureCount:(fc&&fc.features||[]).length,isVisible:true,style:{color:'#1f7a4d',fillOpacity:0.25}}]));
      });
    }
    if(isApi(url)&&/\/gis\/layers\/demo-struct\/metadata(\?|$)/.test(url)){
      /* Live symbology only together with the live polygons; the sample polygons keep the sample legend. */
      return fastLayer().then(function(fc){ return fc&&fc._live?liveMeta():fc&&fc._snapshot?copyMeta():null; }).then(function(m){ return jsonRes(ok(m||DEMO_META)); });
    }
    if(isApi(url)){ var m=(init&&init.method)||'GET'; var b=null; try{b=init&&init.body?JSON.parse(init.body):null;}catch(e){}
      var rb=body(url,m,b); return Promise.resolve(new Response(JSON.stringify(rb),{status:rb&&rb.success===false&&rb.error&&rb.error.code==='DEMO'?400:200,headers:{'Content-Type':'application/json'}})); }
    if(/socket\.io/.test(url)) return Promise.reject(new TypeError('demo: offline'));
    return of.apply(this,arguments);
  };
  var oo=XMLHttpRequest.prototype.open, os=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u);this.__m=m;return oo.apply(this,arguments);};
  XMLHttpRequest.prototype.send=function(data){
    if(!isApi(this.__u)) return os.apply(this,arguments);
    var x=this, b=null; try{b=data?JSON.parse(data):null;}catch(e){}
    var t=JSON.stringify(body(x.__u,x.__m,b));
    ['readyState','status','responseText','response','statusText'].forEach(function(k){
      Object.defineProperty(x,k,{configurable:true,get:function(){return {readyState:4,status:200,responseText:t,response:t,statusText:'OK'}[k];}});});
    x.getAllResponseHeaders=function(){return 'content-type: application/json\r\n';};
    x.getResponseHeader=function(h){return /content-type/i.test(h)?'application/json':null;};
    setTimeout(function(){ x.onreadystatechange&&x.onreadystatechange(); x.dispatchEvent(new Event('readystatechange')); x.onload&&x.onload(); x.dispatchEvent(new Event('load')); x.onloadend&&x.onloadend(); x.dispatchEvent(new Event('loadend'));},30);
  };
})();

;(function(){
  /* Demo only: there is no server here, so satellite tiles are drawn in the browser
     from a smooth pseudo-random field coloured with the same legend as the real index. */
  var CAT=null;
  function cat(){ if(!CAT){ try{ CAT=JSON.parse(localStorage.getItem('__satcat')||'null'); }catch(e){} } return CAT; }
  function h(x,y,s){ var n=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453; return n-Math.floor(n); }
  function noise(x,y,s){ var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi; var u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    var a=h(xi,yi,s),b=h(xi+1,yi,s),c=h(xi,yi+1,s),d=h(xi+1,yi+1,s); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
  function field(x,y,s,res){ res=res||1; var B=Math.max(420,res*20);
    /* fields: blocks of ~400 m with their own crop vigour, plus soft variation inside */
    var bx=Math.floor(x/B), by=Math.floor(y/(B*0.9)), edge=(Math.abs((x/B)%1-0.5)>0.47||Math.abs((y/(B*0.9))%1-0.5)>0.47)?0.25:0;
    var blk=h(bx,by,Math.floor(s));
    var v=0.55*blk+0.25*noise(x/9000,y/9000,s)+0.2*noise(x/(B/3),y/(B/3),s+2)-edge;
    return Math.max(0,Math.min(1,v)); }
  function hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }
  function ramp(leg,v){ if(v<=leg[0].value) return hex(leg[0].color); for(var i=1;i<leg.length;i++){ if(v<=leg[i].value){ var t=(v-leg[i-1].value)/(leg[i].value-leg[i-1].value); var a=hex(leg[i-1].color),b=hex(leg[i].color); return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; } } return hex(leg[leg.length-1].color); }
  var RANGE={NDVI:[-0.1,0.85],SAVI:[-0.1,0.7],NDWI:[-0.7,0.3],NDMI:[-0.4,0.5],NDII:[-0.4,0.5],MSI:[0.3,1.8],BSI:[-0.4,0.4]};
  /* No configuration ID on this device: an empty (transparent) tile, never invented imagery. */
  var BLANK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  function tile(){ return BLANK; }
  window.__SATCAT=[{"key":"TRUE_COLOR","label":"True color","group":"visual","formula":"B04, B03, B02","description":"Natural colours, as the eye sees them.","legend":null,"visual":true},{"key":"FALSE_COLOR","label":"Color infrared (vegetation)","group":"visual","formula":"B08, B04, B03","description":"Healthy vegetation in bright red.","legend":null,"visual":true},{"key":"SWIR","label":"SWIR (soil & moisture)","group":"visual","formula":"B12, B8A, B04","description":"Wet soil dark, dry soil and bare ground bright.","legend":null,"visual":true},{"key":"NDVI","label":"NDVI","group":"vegetation","formula":"(B08 − B04) / (B08 + B04)","description":"Vegetation health and density.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"SAVI","label":"SAVI","group":"vegetation","formula":"1.5 × (B08 − B04) / (B08 + B04 + 0.5)","description":"NDVI corrected for bright soil; better for young crops.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"NDWI","label":"NDWI","group":"water","formula":"(B03 − B08) / (B03 + B08)","description":"Open water and water bodies.","legend":[{"value":-0.8,"color":"#008000"},{"value":0,"color":"#ffffff"},{"value":0.8,"color":"#0000cc"}],"visual":false},{"key":"NDMI","label":"NDMI","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Moisture in the crop canopy.","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"NDII","label":"NDII","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Infrared water-content index (same Sentinel-2 bands as NDMI).","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"MSI","label":"Moisture stress (MSI)","group":"water","formula":"B11 / B08","description":"Higher values mean drier, stressed plants.","legend":[{"value":0.2,"color":"#253494"},{"value":0.6,"color":"#41b6c4"},{"value":1,"color":"#ffffcc"},{"value":1.4,"color":"#fd8d3c"},{"value":2,"color":"#bd0026"}],"visual":false},{"key":"BSI","label":"Bare soil (BSI)","group":"soil","formula":"((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))","description":"Bare and exposed soil.","legend":[{"value":-0.6,"color":"#1a9850"},{"value":-0.2,"color":"#91cf60"},{"value":0,"color":"#fee08b"},{"value":0.15,"color":"#fc8d59"},{"value":0.3,"color":"#d73027"},{"value":0.6,"color":"#7f0000"}],"visual":false}];
  var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:true,
    get:function(){ return d.get.call(this); },
    set:function(v){ if(typeof v==='string'&&v.indexOf('/satellite/wms')>=0){ try{ v=(window.__devSat&&window.__devSat.tileUrl(v))||tile(v); }catch(e){} } d.set.call(this,v); }});
  var of=window.fetch;
  window.fetch=function(u,o){ if(typeof u==='string'&&u.indexOf('/satellite/wms')>=0){ var live=window.__devSat&&window.__devSat.tileUrl(u); return of(live||tile(u)); } return of.apply(this,arguments); };
})();
