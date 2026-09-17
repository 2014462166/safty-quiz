/* 过渡兼容文件
   —— 上一版页面（缓存中的 v6）里的「新版题库」按钮指向本文件。
      这里同步加载当前的安规题库，并额外注册到旧版的 new 键上，
      使缓存页面也能正常切换题库，而不是提示加载失败。
      当前版本页面已直接引用 assets/questions-anquan.js，本文件仅为过渡保留。 */
document.write('<script src="assets/questions-anquan.js"><\/script>');
document.write('<script>window.QUESTION_BANKS.new=window.QUESTION_BANKS.new||window.QUESTION_BANKS.anquan;<\/script>');
