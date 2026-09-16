/* 旧入口兼容文件
   —— 早期版本的页面引用的是 assets/questions.js，这里同步转发到实际题库文件，
      使得「新页面 + 旧缓存脚本」或「旧页面 + 新数据」等缓存混用情况下页面仍能正常加载。
      当前版本页面已直接引用 assets/questions-old.js，本文件仅为过渡保留。 */
document.write('<script src="assets/questions-old.js"><\/script>');
