/* 过渡兼容文件
   —— 上一版页面（缓存中的 v7）默认引用 assets/questions-old.js。
      这里同步加载当前的安规题库，并注册到旧的 old 键上，
      使缓存页面仍可正常加载题库。当前版本页面已直接引用 assets/questions-anquan.js。 */
document.write('<script src="assets/questions-anquan.js"><\/script>');
document.write('<script>window.QUESTION_BANKS.old=window.QUESTION_BANKS.old||window.QUESTION_BANKS.anquan;<\/script>');
