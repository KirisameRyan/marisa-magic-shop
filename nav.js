// Shared navigation entry point; works from root or nested pages.
(function(){
 var root=new URL('.',document.currentScript.src);
 var script=document.createElement('script');
 script.src=new URL('js/navigation.js',root).href;
 document.head.appendChild(script);
})();
