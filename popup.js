// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
function toArray(domList) {
  const arr = []
  for (let i = 0; i < domList.length; i++) {
    arr.push(domList[i])
  }
  return arr
}
function workDayIndex(date) {
  const month = date.getMonth() + 1
  const monthPrefix = month < 10 ? "0" : ""
  const dateInMonth = date.getDate()
  const datePrefix = date < 10 ? "0" : ""
  return monthPrefix + month + "-" + datePrefix + dateInMonth;
}

function extractWorkItem(itemDom) {
  let item = {}
  const isNewPlatform = !itemDom.style.backgroundColor.includes("(255, 255, 255)")
  const timeTr = itemDom.children[0].children[0].children[0];
  let time = timeTr.innerText;
  const detailTrs = toArray(itemDom.children[1].children[0].children[0].children[0].children[0].children[0].children)
  let user = detailTrs[0].innerText;
  let classType = detailTrs[2].innerText;
  let classHour = classType.includes("规划") ? 0.5 : 1.5
  return { time, user, classType, classHour, isNewPlatform };
}

function extractWeekWork(weekDocument) {
  const thList = toArray(weekDocument.getElementsByClassName("date_line")[0].children);
  const trList = toArray(document.getElementsByClassName("class_info")).map(trDom => toArray(trDom.children));
  const weekData = {};
  for (let thIndex = 0; thIndex < thList.length; thIndex++) {
    let dateText = thList[thIndex].innerText;
    let dateKey = dateText.trim();
    let dateWorkList = [];
    trList.forEach(tr => {
      const tdDom = tr[thIndex];
      if (tdDom.className.includes("has_item")) {
        dateWorkList.push(extractWorkItem(tdDom))
      }
    })
    weekData[dateKey] = dateWorkList;
  }
  return weekData;
}

function dayString(date) {
  return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`
}

function getWorkList(date) {
  return new Promise((resolve, reject) => {
    var x = new XMLHttpRequest();
    x.open('GET', "http://xdf.helxsoft.cn/t/mycourse?date=" + date);
    x.responseType = 'document';
    x.onload = function(res) {
      resolve(extractWeekWork(x.responseXML))
    };
    x.onerror = function(err) {
      console.log(err)
      reject(err)
    };
    x.send();
  })
}

function caculate () {
  const now = new Date()
  const year = now.getFullYear(), month = now.getMonth(), date = now.getDate(), day= now.getDay()
  const startDay = month == 0 ? new Date(year - 1, 11, 21) : new Date(year, month - 1, 21)
  const endDay = new Date(year, month, 20)
  const startDayInWeek = startDay.getDay() - 1
  let apiStartDay = new Date(startDay.getFullYear(), startDay.getMonth(), 21 - (startDay.getDay() - 1))
  const apiStartDays = []
  while(apiStartDay.getTime() < endDay.getTime() || apiStartDay.getDate() < endDay.getDate()) {
    apiStartDays.push(apiStartDay)
    apiStartDay = new Date(apiStartDay.getFullYear(), apiStartDay.getMonth(), apiStartDay.getDate() + 7)
  }
  const apiPromises = apiStartDays.map(date => dayString(date)).map(dateString => getWorkList(dateString));
  return Promise.all(apiPromises)
    .then((weekWorkMaps) => {
      const monthWorkMap = weekWorkMaps.reduce((result, map) => Object.assign(result, map), {})
      console.log(monthWorkMap)
      return Promise.resolve(monthWorkMap)
    })
    .then(monthWorkMap => { //过滤掉无效的日期
      const startKey = workDayIndex(startDay)
      const endKey = workDayIndex(endDay)
      const dayKeys = Object.keys(monthWorkMap).filter(key => startKey <= key.substr(0, 5) && endKey >= key.substr(0, 5))
      const realWorkMap = {}
      dayKeys.forEach(dayKey => {
        realWorkMap[dayKey] = monthWorkMap[dayKey]
      })
      console.log(realWorkMap)
      return Promise.resolve(realWorkMap)
    })
    .then(workMap => { //转成 studentsMap
      const newStudentsMap = {}
      const oldStudentsMap = {}
      for (let day in workMap) {
        const dayClassList = workMap[day]
        dayClassList.forEach(dayClass => {
          const user = dayClass.user.trim()
          const classRecord = { day, time: dayClass.time, type: dayClass.classType, hour: dayClass.hour }
          const curStudent = null
          if (dayClass.isNewPlatform) {
            newStudentsMap[user] ? (curStudent = newStudentsMap[user]) : (curStudent = newStudentsMap[user] = { total: 0, classes: []})
          } else {
            oldStudentsMap[user] ? (curStudent = oldStudentsMap[user]) : (curStudent = oldStudentsMap[user] = { total: 0, classes: []})
          }
          curStudent.total = curStudent.total + dayClass.classHour
          curStudent.total.classes.push(classRecord)
        })
      }
      return Promise.resolve({newStudentsMap, oldStudentsMap})
    })
    .then(studentsMap => {
      let results = []
      let total = 0
      for (var oldStudent in studentsMap.oldStudentsMap) {
        const student = studentsMap.oldStudentsMap[oldStudent]
        total += student.total
        const studentMsg = (oldStudent + "                 ").substr(0, 15) + ":    " + student.total
        results.push(studentMsg)
      }
      const spliterMsg = "    >> 以下是新平台学生  <<    "
      results.push(spliterMsg)
      for (var newStudent in studentsMap.newStudentsMap) {
        const student = studentsMap.newStudentsMap[newStudent]
        total += student.total
        const studentMsg = (newStudent + "                 ").substr(0, 15) + ":    " + student.total
        results.push(studentMsg)
      }
      const totalMsg = "总计:   " + total
      results.push(totalMsg)
      console.log(studentsMap)
      return Promise.resolve(results)
    })
}



/**
 * Get the current URL.
 *
 * @param {function(string)} callback - called when the URL of the current tab
 *   is found.
 */

function getCurrentTabUrl(callback) {
  // Query filter to be passed to chrome.tabs.query - see
  // https://developer.chrome.com/extensions/tabs#method-query
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    // chrome.tabs.query invokes the callback with a list of tabs that match the
    // query. When the popup is opened, there is certainly a window and at least
    // one tab, so we can safely assume that |tabs| is a non-empty array.
    // A window can only have one active tab at a time, so the array consists of
    // exactly one tab.
    var tab = tabs[0];

    // A tab is a plain object that provides information about the tab.
    // See https://developer.chrome.com/extensions/tabs#type-Tab
    var url = tab.url;

    // tab.url is only available if the "activeTab" permission is declared.
    // If you want to see the URL of other tabs (e.g. after removing active:true
    // from |queryInfo|), then the "tabs" permission is required to see their
    // "url" properties.
    console.assert(typeof url == 'string', 'tab.url should be a string');

    callback(url);
  });

  // Most methods of the Chrome extension APIs are asynchronous. This means that
  // you CANNOT do something like this:
  //
  // var url;
  // chrome.tabs.query(queryInfo, function(tabs) {
  //   url = tabs[0].url;
  // });
  // alert(url); // Shows "undefined", because chrome.tabs.query is async.
}

function renderStatus(statusText) {
  document.getElementById('status').textContent = statusText;
}

function renderResults(results) {
  const xdfDom = document.getElementById('xdf')
  results.forEach(result => {
    console.log(result)
    const pDom = document.createElement('p')
    pDom.textContent = result
    xdfDom.appendChild(pDom)
  })
}

document.addEventListener('DOMContentLoaded', function() {
  renderStatus("正在计算中...")
  caculate()
    .then(results => {
      renderStatus("成功！")
      renderResults(results)
    })
    .catch(error => {
      renderStatus("出错了: " + error)
    })
});
