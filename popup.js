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
    let time = timeTr.innerText.trim();// 20:15 ~ 20:45
    const [ [ h1, m1], [ h2, m2 ] ] = time.split("～").map(s => s.split(':').map(i => ~~i))
    const classHour = h2 - h1 + (m2 - m1) / 60
    const detailTrs = toArray(itemDom.children[1].children[0].children[0].children[0].children[0].children[0].children)
    let user = detailTrs[0].innerText.trim();
    let classType = detailTrs[2].innerText.trim() + (user.includes("体验SY") ? "(体验课)" : "");

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

const ONE_DAY_TIME = 24 * 60 * 60 * 1000

function caculate (startDate, endDate) {
    const now = new Date()
    const startDay = startDate
    const endDay = endDate

    /**
     * 请求日期: 一周内(周一 ~ 周日)的日期结果相同
     * 起始日期以 startDate ，后续使用下周的周一
     */
    const startDayInWeek = startDay.getDay() // sun: 0, mon - sat:  1 ~ 6
    const startDayIndex = startDay.getDay() === 0 ? 6 : (startDay.getDay() - 1)
    const endDayIndex = endDay.getDay() === 0 ? 6 : (endDay.getDay() - 1)

    const apiDays = []
    let apiDay = new Date(startDay.getTime() - startDayIndex * ONE_DAY_TIME)
    while (apiDay.getTime() <= endDay.getTime()) {
        apiDays.push(apiDay)
        apiDay = new Date(apiDay.getTime() + 7 * ONE_DAY_TIME)
    }

    const apiPromises = apiDays.map(date => dayString(date)).map(dateString => getWorkList(dateString));
    return Promise.all(apiPromises).then(weekWorkMaps => {
    	// 给key增加年份 '01-01(一)' => '2018-01-01(一)'
    	let cursorDay = apiDays[0]
		let offset = 0
		const newWeekWorkMaps = []
		weekWorkMaps.forEach(weekWorkMap => {
			 const workMap = {}
			 Object.keys(weekWorkMap).forEach(dayKey => {
				 cursorDay = new Date(cursorDay.getTime() + offset * ONE_DAY_TIME)
				 workMap[`${cursorDay.getFullYear()}-${dayKey}`] = weekWorkMap[dayKey]
				 offset += 1
			 })
			newWeekWorkMaps.push(workMap)
		})
		return newWeekWorkMaps
	}).then((weekWorkMaps) => {
        const monthWorkMap = {}
        if (weekWorkMaps.length === 1) { //在同一周内
        	const weekWorkMap = weekWorkMaps[0]
			const validKeys = Object.keys(weekWorkMap).slice(startDayIndex, endDayIndex + 1)
			validKeys.forEach(validKey => {
				monthWorkMap[validKey] = weekWorkMap[validKey]
			})
		} else {
        	const firtWeekMap = weekWorkMaps[0]
			Object.keys(firtWeekMap).slice(startDayIndex).forEach(key => {
				monthWorkMap[key] = firtWeekMap[key]
			})
        	const lastWeekMap = weekWorkMaps[weekWorkMaps.length - 1]
			Object.keys(lastWeekMap).slice(0, endDayIndex + 1).forEach(key => {
				monthWorkMap[key] = lastWeekMap[key]
			})
			for (let i = 1; i < weekWorkMaps.length - 1; i += 1) {
				const curWeekMap = weekWorkMaps[i]
				Object.keys(curWeekMap).forEach(key => {
					monthWorkMap[key] = curWeekMap[key]
				})
        	}
    	}
    	console.log(monthWorkMap)
		/**
		 {
		 	'2018-01-01(一)': [
		 		{
		 			classHour: 1.5,
		 			classType: '雅思语法',
		 			isNewPlatform: false,
		 			time: '08:00 ~ 09:30',
		 			user: '01RYSE044【midexiang1992 】徐凡-重读】'
		 		}
		 	]
		 }
		 */
    	return Promise.resolve(monthWorkMap)
    }).then(workMap => { //转成 studentsMap
        const newStudentsMap = {}
        const oldStudentsMap = {}
        const timeBasedStudentsMap = {} // { 0.5: { [user]: [ classRecord ] }}
        let totalHour = 0
        let planHour = 0
        let formalHour = 0
        let experienceHour = 0
        for (let day in workMap) {
            const dayClassList = workMap[day]
            dayClassList.forEach(dayClass => {
                const user = dayClass.user.trim()
                const classRecord = { day, time: dayClass.time, type: dayClass.classType, hour: dayClass.classHour }
                const studentsMap = dayClass.isNewPlatform ? newStudentsMap : oldStudentsMap
                if (!studentsMap[user]) {
                    studentsMap[user] = { total: 0, planCount: 0, formalCount:0, experienceCount: 0, classes: [] }
                }
                if (!timeBasedStudentsMap[dayClass.hour]) {
                    timeBasedStudentsMap[dayClass.hour] = {}
                }
                if (!timeBasedStudentsMap[dayClass.hour][user]) {
                    timeBasedStudentsMap[dayClass.hour][user] = []
                }
                timeBasedStudentsMap[dayClass.hour][user].push(classRecord)
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
        return Promise.resolve({newStudentsMap, oldStudentsMap, timeBasedStudentsMap, totalHour, planHour, formalHour, experienceHour })
    }).then(studentsMap => {//转成两个Array
        console.log(studentsMap)
        const newPlatformMap = {}
        const oldPlatformMap = {}
        const arr = [ studentsMap.newStudentsMap, studentsMap.oldStudentsMap ]
        arr.forEach((studentMap, i) => {
            const resMap = [ newPlatformMap, oldPlatformMap ][i]
            for (let name in studentMap) {
                const { classes } = studentMap[name] // { total: 0, planCount: 0, formalCount:0, experienceCount: 0, classes: [] }
                const displayName = align(name, 30)
                classes.forEach(record => {
                    if (!resMap[record.hour]) {
                        resMap[record.hour] = {}
                    }
                    if (!resMap[record.hour][displayName]) {
                        resMap[record.hour][displayName] = []
                    }
                    resMap[record.hour][displayName].push(record)
                })
            }
        })
        const { totalHour, planHour, formalHour, experienceHour } = studentsMap
        return Promise.resolve({ newPlatformMap, oldPlatformMap, totalHour, planHour, formalHour, experienceHour})
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
    const newMap = {}
    Object.keys(result.newPlatformMap).forEach(hour => {
        newMap[hour] = {}
        const userMap = result.newPlatformMap[hour]
        Object.keys(userMap).forEach(name => {
            const showTypeRecords = userMap[name].filter(record => {
                const [ isPlan, isExperience ] = [ '规划', '体验课' ].map(sn => record.type.indexOf(sn) !== -1)
                switch (showType) {
                    case 'plan': return isPlan
                    case 'experience': return isExperience
                    case 'formal': return !isPlan && !isExperience
                    default: return true
                }
            })
            if (showTypeRecords.length) {
                newMap[hour][name] = showTypeRecords
            }
        })
    })
    const oldMap = {}
    Object.keys(result.oldPlatformMap).forEach(hour => {
        oldMap[hour] = {}
        const userMap = result.oldPlatformMap[hour]
        Object.keys(userMap).forEach(name => {
            const showTypeRecords = userMap[name].filter(record => {
                const [ isPlan, isExperience ] = [ '规划', '体验课' ].map(sn => record.type.indexOf(sn) !== -1)
                switch (showType) {
                    case 'plan': return isPlan
                    case 'experience': return isExperience
                    case 'formal': return !isPlan && !isExperience
                    default: return true
                }
            })
            if (showTypeRecords.length) {
                oldMap[hour][name] = showTypeRecords
            }
        })
    })
    xdfDom.appendChild(generateDom("p", "new-platform-tip", "新平台"))
    Object.keys(newMap).forEach(hour => {
        const userMap = newMap[hour]
        if (Object.keys(userMap).length > 0) {
            const totalCount = caculateTotal(userMap)
            const time = hour < 1 ? `${hour * 60}分钟` : `${hour}小时`
            xdfDom.appendChild(generateDom("p", "time-group", `课时${time} (共${totalCount}次课, 共${totalCount * hour}小时)`))
            Object.keys(userMap).forEach(user => {
                xdfDom.appendChild(generateDom("p", "new-student-info", `${user}: ${userMap[user].length}次`))
            })
        }
    })
    xdfDom.appendChild(generateDom("p", "old-platform-tip", "<strong>老</strong>平台"))
    Object.keys(oldMap).forEach(hour => {
        const userMap = oldMap[hour]
        if (Object.keys(userMap).length > 0) {
            const totalCount = caculateTotal(userMap)
            const time = hour < 1 ? `${hour * 60}分钟` : `${hour}小时`
            xdfDom.appendChild(generateDom("p", "time-group", `课时${time} (共${totalCount}次课, 共${totalCount * hour}小时)`))
            Object.keys(userMap).forEach(user => {
                xdfDom.appendChild(generateDom("p", "old-student-info", `${user}: ${userMap[user].length}次`))
            })
        }
    })
    xdfDom.appendChild(generateDom("p", "total", `总计:  ${result.totalHour}小时 (规划: ${result.planHour}小时，正课: ${result.formalHour}小时)， 体验课: ${result.experienceHour}小时`))
}

function caculateTotal (userMap) {
    let totalCount = 0
    Object.keys(userMap).forEach(name => {
        totalCount += userMap[name].length
    })
    return totalCount
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
            caculate(new Date(startTime), new Date(endTime)).then(res => {
                renderStatus("成功！")
                result = res
                renderResults(result, showType)
            }).catch(error => {
                renderStatus("出错了: " + error)
            })
        } else {
            renderStatus("时间格式填写错误")
        }
    }
});

(function () {
    const date = new Date()
    const curMonth = date.getMonth()
    const curYear = date.getFullYear()
    const formatMonth = m => m < 10 ? `0${m}` : `${m}`
    const endDay = `${curYear}-${formatMonth(curMonth+1)}-20`
    let startDay = null
    if (curMonth === 0) {
        starDay = `${curYear - 1}-12-21`
    } else {
        startDay = `${curYear}-${formatMonth(curMonth)}-21`
    }
    setTimeout(() => {
        document.querySelector('#startTime').value = startDay
        document.querySelector('#endTime').value = endDay
    }, 0)
})()