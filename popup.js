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

const CLASS_TYPE = {

}

function extractWorkItem(itemDom) {
  let item = {}
  const isNewPlatform = itemDom.style.backgroundColor.includes("(255, 255, 255)")
  const timeTr = itemDom.children[0].children[0].children[0];
  let time = timeTr.innerText;
  const detailTrs = toArray(itemDom.children[1].children[0].children[0].children[0].children[0].children[0].children)
  let user = detailTrs[0].innerText;
  let classType = detailTrs[2].innerText + (user.includes("体验SY") ? "(体验课)" : "");
  let classHour = 1.5;
  if (classType.includes("规划")) {
    classHour = 0.5;
  } else if (classType.includes("体验课")) {
    classHour = 0.75;
  }
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
  const startPos = str.indexOf('【')
  let newStr = str.substr(startPos)
  let suffix = ""
  for (let i = 0; i < alignLen; i++) {
    suffix += " "
  }
  return (newStr + suffix).substr(0, alignLen)
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

function caculate (startDate, endDate) {
  const now = new Date()
  const year = now.getFullYear(), month = now.getMonth(), date = now.getDate(), day= now.getDay()
  let startDay = month == 0 ? new Date(year - 1, 11, 21) : new Date(year, month - 1, 21)
  let endDay = new Date(year, month, 20)
  if (startDate) {
    startDay = startDate
  }
  if (endDate) {
    endDay = endDate
  }
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
      let planHour = 0
      let formalHour = 0
      let experienceHour = 0
      for (let day in workMap) {
        const dayClassList = workMap[day]
        dayClassList.forEach(dayClass => {
          const user = dayClass.user.trim()
          const classRecord = { day, time: dayClass.time, type: dayClass.classType, hour: dayClass.hour }
          const studentsMap = dayClass.isNewPlatform ? newStudentsMap : oldStudentsMap
          if (!studentsMap[user]) {
            studentsMap[user] = { total: 0, planCount: 0, formalCount:0, experienceCount: 0, classes: [] }
          }
          if (dayClass.classType.includes("规划")) {
            studentsMap[user].planCount = studentsMap[user].planCount + 1
            planHour += dayClass.classHour
          } else if (dayClass.classType.includes("体验课")) {
            studentsMap[user].experienceCount += 1
            experienceHour += dayClass.classHour
          } else {
            studentsMap[user].formalCount = studentsMap[user].formalCount + 1
            formalHour += dayClass.classHour
          }
          studentsMap[user].total = studentsMap[user].total + dayClass.classHour
          studentsMap[user].classes.push(classRecord)
          totalHour += dayClass.classHour
        })
      }
      return Promise.resolve({newStudentsMap, oldStudentsMap, totalHour, planHour, formalHour, experienceHour })
    })
    .then(studentsMap => {//转成两个Array
      console.log(studentsMap)
      const newPlatformStudents = []
      const oldPlatformStudents = []
      for (let name in studentsMap.newStudentsMap) {
        newPlatformStudents.push(Object.assign({ name: align(name, 30) }, studentsMap.newStudentsMap[name]))
      }
      for (let name in studentsMap.oldStudentsMap) {
        oldPlatformStudents.push(Object.assign({ name: align(name, 30) }, studentsMap.oldStudentsMap[name]))
      }
      const { totalHour, planHour, formalHour, experienceHour } = studentsMap
      return Promise.resolve({ newPlatformStudents, oldPlatformStudents, totalHour, planHour, formalHour, experienceHour})
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

function renderResults(result, showType) {
  const xdfDom = document.getElementById('xdf')
  xdfDom.innerHTML = ""
  const newPlatformStudents = result.newPlatformStudents.filter(student => {
    if (showType == 'plan') {
      return student.planCount > 0
    } else if (showType == 'formal') {
      return student.formalCount > 0
    } else if (showType == 'experience') {
      return student.experienceCount > 0
    }
    return true
  })
  const oldPlatformStudents = result.oldPlatformStudents.filter(student => {
    if (showType == 'plan') {
      return student.planCount > 0
    } else if (showType == 'formal') {
      return student.formalCount > 0
    } else if (showType == 'experience') {
      return student.experienceCount > 0
    }
    return true
  })
  xdfDom.appendChild(generateDom("p", "new-platform-tip", "新平台"))
  newPlatformStudents.forEach(student => {
    let studentInfo = `${student.name}:    `
    if (showType == 'plan' || showType == 'all') {
      studentInfo +=  `规划课 ${student.planCount} 次 ;    `
    }
    if (showType == 'formal' || showType == 'all') {
      studentInfo += `正课 ${student.formalCount} 次 ;    `
    }
    if (showType == 'experience' || showType == 'all') {
      studentInfo += `体验课 ${student.experienceCount} 次`
    }
    xdfDom.appendChild(generateDom("p", "new-student-info", studentInfo))
  })
  xdfDom.appendChild(generateDom("p", "old-platform-tip", "<strong>老</strong>平台"))
  oldPlatformStudents.forEach(student => {
    let studentInfo = `${student.name}:    `
    if (showType == 'plan' || showType == 'all') {
      studentInfo +=  `规划课 ${student.planCount} 次 ;    `
    }
    if (showType == 'formal' || showType == 'all') {
      studentInfo += `正课 ${student.formalCount} 次;    `
    }
    if (showType == 'experience' || showType == 'all') {
      studentInfo += `体验课 ${student.experienceCount} 次`
    }
    xdfDom.appendChild(generateDom("p", "old-student-info", studentInfo))
  })
  xdfDom.appendChild(generateDom("p", "total", `总计:  ${result.totalHour}小时 (规划: ${result.planHour}小时，正课: ${result.formalHour}小时)， 体验课: ${result.experienceHour}小时`))
}


document.addEventListener('DOMContentLoaded', function() {
  let showType = null
  let result = null
  toArray(document.getElementsByName("showType")).forEach(inputDom => {
    if (inputDom.checked) {
      showType = inputDom.value
    }
    inputDom.onclick = function() {
      if (showType !== inputDom.value) {
        showType = inputDom.value
        result && renderResults(result, showType)
      }
    }
  })
  document.getElementById("caculateBtn").onclick = function() {
    const startTime = document.getElementById("startTime").value
    const endTime = document.getElementById("endTime").value
    if (startTime.match(/\d{4}-\d{2}-\d{2}/) && endTime.match(/\d{4}-\d{2}-\d{2}/)) {
      renderStatus("正在计算中...")
      caculate(new Date(startTime), new Date(endTime))
        .then(res => {
          renderStatus("成功！")
          result = res
          renderResults(result, showType)
        })
        .catch(error => {
          renderStatus("出错了: " + error)
        })
    } else {
      renderStatus("时间格式填写错误")
    }
  }
});
