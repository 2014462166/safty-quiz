/* 过渡兼容文件
   —— 上一版页面（缓存）中的「新版题库」按钮指向本文件，这里转发到当前的安规题库，
      避免旧缓存页面切换题库时报错。当前版本页面已直接引用 assets/questions-anquan.js。 */
document.write('<script src="assets/questions-anquan.js"><\/script>');
