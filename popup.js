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
  const isNewPlatform = itemDom.style.backgroundColor.includes("(255, 255, 255)")
  const timeTr = itemDom.children[0].children[0].children[0];
  let time = timeTr.innerText;
  const detailTrs = toArray(itemDom.children[1].children[0].children[0].children[0].children[0].children[0].children)
  let user = detailTrs[0].innerText;
  let classType = detailTrs[2].innerText;
  let classHour = classType.includes("规划") ? 0.5 : 1.5
  return { time: time, user: user, classType: classType, classHour: classHour, isNewPlatform: isNewPlatform };
}

function extractWeekWork(weekDocument) {
  const thList = toArray(weekDocument.getElementsByClassName("date_line")[0].children);
  const trList = toArray(weekDocument.getElementsByClassName("class_info")).map(trDom => toArray(trDom.children));
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

function align(str, alignLen) {
  let suffix = ""
  for (let i = 0; i < alignLen; i++) {
    suffix += " "
  }
  return (str + suffix).substr(0, alignLen)
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
      return Promise.resolve(realWorkMap)
    })
    .then(workMap => { //转成 studentsMap
      const newStudentsMap = {}
      const oldStudentsMap = {}
      let totalHour = 0
      for (let day in workMap) {
        const dayClassList = workMap[day]
        dayClassList.forEach(dayClass => {
          const user = dayClass.user.trim()
          const classRecord = { day, time: dayClass.time, type: dayClass.classType, hour: dayClass.hour }
          const studentsMap = dayClass.isNewPlatform ? newStudentsMap : oldStudentsMap
          if (!studentsMap[user]) {
            studentsMap[user] = { total: 0, planCount: 0, formalCount:0, classes: [] }
          }
          if (dayClass.classType.includes("规划")) {
            studentsMap[user].planCount = studentsMap[user].planCount + 1
          } else {
            studentsMap[user].formalCount = studentsMap[user].formalCount + 1
          }
          studentsMap[user].total = studentsMap[user].total + dayClass.classHour
          studentsMap[user].classes.push(classRecord)
          totalHour += dayClass.classHour
        })
      }
      return Promise.resolve({newStudentsMap, oldStudentsMap, totalHour})
    })
    .then(studentsMap => {//转成两个Array
      const newPlatformStudents = []
      const oldPlatformStudents = []
      for (let name in studentsMap.newStudentsMap) {
        newPlatformStudents.push(Object.assign({ name: align(name, 30) }, studentsMap.newStudentsMap[name]))
      }
      for (let name in studentsMap.oldStudentsMap) {
        oldPlatformStudents.push(Object.assign({ name: align(name, 30) }, studentsMap.oldStudentsMap[name]))
      }
      return Promise.resolve({ newPlatformStudents, oldPlatformStudents, totalHour: studentsMap.totalHour })
    })
}

// Render
function renderStatus(statusText) {
  document.getElementById('status').textContent = statusText;
}

function generateDom(type="p", className="", message="") {
  let pDom = document.createElement(type)
  pDom.className = className
  pDom.innerHTML = message
  return pDom
}

function renderResults(result) {
  const xdfDom = document.getElementById('xdf')
  xdfDom.appendChild(generateDom("p", "new-platform-tip", "新平台"))
  result.newPlatformStudents.forEach(student => {
    const studentInfo = `${student.name}:   规划课 ${student.planCount} 次 ; 正课 ${student.formalCount} 次`
    xdfDom.appendChild(generateDom("p", "new-student-info", studentInfo))
  })
  xdfDom.appendChild(generateDom("p", "old-platform-tip", "<strong>老</strong>平台"))
  result.oldPlatformStudents.forEach(student => {
    const studentInfo = `${student.name}:   规划课 ${student.planCount} 次 ; 正课 ${student.formalCount} 次`
    xdfDom.appendChild(generateDom("p", "old-student-info", studentInfo))
  })
  xdfDom.appendChild(generateDom("p", "total", `总计:  ${result.totalHour}小时`))
}

document.addEventListener('DOMContentLoaded', function() {
  renderStatus("正在计算中...")
  caculate()
    .then(result => {
      renderStatus("成功！")
      renderResults(result)
    })
    .catch(error => {
      renderStatus("出错了: " + error)
    })
});
