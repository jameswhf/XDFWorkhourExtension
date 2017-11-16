function getScheduleTable(){
    return document.getElementsByClassName('tagTable')
}

function highlight () {
    const tagTable = getScheduleTable()[0]
    console.log(tagTable.className)
    if (tagTable) {
        if (tagTable.className.indexOf('highlighted') >= 0) {
            return;
        }
        tagTable.className = `${tagTable.className} highlighted`
    }
    const trRows = Array.from(document.getElementsByClassName('class_info'))
    trRows.forEach(trRow => {
      const tdColumns = Array.from(trRow.children).filter(tdColumn => tdColumn.className.indexOf('has_item') >= 0)
      const classTables = tdColumns.map(tdColumn => tdColumn.children[1])
      classTables.forEach((classTable, index) => {
          if (classTable.innerText.indexOf('写作') >= 0) {
              tdColumns[index].style.backgroundColor = 'rgb(250,140,150)'
            //   classTable.className = "highlightWritting"
          }
      })
    })
}

setInterval(function() {
    highlight()
}, 1000)
