/* 过渡兼容文件
   —— 早期版本页面引用的 assets/questions.js（单题库时代）。
      这里同步加载当前的安规题库，并同时注册到旧的 old / QUESTION_BANK 上，
      使缓存中的旧页面仍可正常工作。当前版本页面已直接引用 assets/questions-anquan.js。 */
document.write('<script src="assets/questions-anquan.js"><\/script>');
document.write('<script>window.QUESTION_BANKS.old=window.QUESTION_BANKS.old||window.QUESTION_BANKS.anquan;window.QUESTION_BANK=window.QUESTION_BANK||window.QUESTION_BANKS.anquan;<\/script>');
