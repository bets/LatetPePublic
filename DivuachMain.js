// CONSTANTS
const nameCol = 0;//A
const mailCol = 1;//B
const kmCol = 2;//D
const kmPayCol = 3;//E
const seniorityGroupCol = 4;//G
const activityCol = 5;//J
const seniority1Col = 6;//K
const seniority6Col = 7;//L
const seniority26Col = 8;//M
const constNameCol = 9;//O
const constValCol = 10;//P

// GET GOOGLE SHEET DATA
google.charts.load("current", { packages: ["corechart"] });
google.charts.setOnLoadCallback(function () {
    var query = new google.visualization.Query(
        `https://docs.google.com/spreadsheets/d/${sourceSheetId}/gviz/tq`
    );
    query.setQuery("select A,B,D,E,G,J,K,L,M,O,P");
    query.send(handleQueryResponse);
});
var data;
function handleQueryResponse(re) {
    if (re.isError()) {
        console.log(
            `Error in query: ${re.getMessage()} ${re.getDetailedMessage()}`
        );
        return;
    }
    data = re.getDataTable();

    //CREATE
    makeSelect(getCol(nameCol, mailCol), "payCalcName", true); //and email
    makeSelect(getCol(activityCol), "activityType");
    makeSelect(getCol(seniorityGroupCol), "seniority");
    makeSelect([1, 2, 3, 4, 5, 6, 7], "activityAmount");
    //save first row as template
    rowClone = qs("#payCalc tbody tr").cloneNode(true);
    setNewRowNum();
    restoreFromStorage();
    addEventListeners();
}

// HANDEL DATA FROM SHEETS

/**Get a column or 2 from sheet db
Return as array of {lable,val}
If only 1 column so val will be index number
*/
function getCol(col, valCol) {
    var rows = [];
    var key;
    for (let i = 0; i < data.getNumberOfRows(); i++) {
        key = getValue(i, col);
        let cell = isNaN(key) ? key?.trim() : key.toString();
        if (cell.length == 0) break;
        rows.push({
            key: key,
            val: valCol ? getValue(i, valCol) : i + 1
        });
    }
    return rows;
}

/** get value from sheet db (starts at 0 from after frozen row) */
function getValue(row, col) {
    return data.getValue(row, col) ?? "";
}

/** Get the data-val from the option of the chosen key */
function getValFromList(rowNum, tdClass) {
    let key = qs(`[data-rownum='${rowNum}'] .${tdClass} input`).value;
    let option = Array.from(qsa(`#${tdClass}List option`)).find(
        (x) => x.innerText == key
    );
    return option ? option.dataset.val : null;
}

/** Get the data-tag of an option from a list 
 * @param key {string} a The first number to add
 * @param tdClass {string} b The second number to add
 * @returns {string} the tag name
 */
function getTagFromListOption(key, tdClass) {
    let option = Array.from(qsa(`#${tdClass}List option`)).find(
        (x) => x.innerText == key
    );
    return option ? option.dataset.tag : null;
}

//#region CREATE ELEMENTS
var rowClone;
function addRow() {
    let clone = rowClone.cloneNode(true);
    qs("#payCalc tbody").append(clone);
    setNewRowNum();
    addEventListeners();
}

function setNewRowNum() {
    let i = 0;
    qsa("#payCalc tbody tr").forEach(function (e) {
        e.dataset.rownum = i++;
    });
}

//Create a list of options to populate an input
function makeSelect(options, target, isId) {
    let input = document.createElement("input");
    input.type = "search";
    input.setAttribute("placeholder", "???? ??????????"); // ???
    input.setAttribute("list", target + "List");
    var datalist = document.createElement("datalist");
    datalist.id = target + "List";
    for (let i in options) {
        let option = document.createElement("option");

        let txt = options[i].key ?? options[i];
        if (isNaN(txt)) {
            let matches = txt.match(/\{.*?\}/);
            if (matches != null) {//matches.length > 0) {
                txt = txt.replace(matches[0], "").trim();
                option.dataset.tag = matches[0];//add a tag for special addones, for now only one tag in this format "{tag name}"
            }
        }
        option.textContent = txt;
        option.dataset.val = options[i].val ?? options[i];
        datalist.appendChild(option);
    }
    let selector = isId ? "#" : "#payCalc tbody tr .";
    qs(selector + target).appendChild(input);
    qi("lists").appendChild(datalist);
}
//#endregion

//#region Local Storage
function saveToStorage() {
    qsa("#payCalc input").forEach((el) => {
        if (el.type == "checkbox") {
            if (el.checked) el.setAttribute("checked", "");
            else el.removeAttribute("checked");
        } else el.setAttribute("value", el.value);
    });
    let table = qs("#payCalc .tableContainer Table");
    var serializer = new XMLSerializer();
    var tableStr = serializer.serializeToString(table);
    localStorage.setItem("payCalcTable" + officeAdd, tableStr);
    localStorage.setItem("payCalcName" + officeAdd, qs("#payCalcName input").value);
    localStorage.setItem("payCalcSaveTime" + officeAdd, new Date());
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function clearStorage(ask = true) {
    if (ask) if (!confirm("?????????? ?????? ?????????????? ?????????")) return;
    localStorage.removeItem("payCalcTable" + officeAdd);
    localStorage.removeItem("payCalcName" + officeAdd);
    localStorage.removeItem("payCalcSaveTime" + officeAdd);
    qs("#payCalcName input").value = "";
    qsa("#payCalc tbody tr").forEach((e) => removeRow(e, false));
    addRow();
    qi("saveInfo").hidden = true;
}
function restoreFromStorage() {
    let saved = localStorage.getItem("payCalcTable" + officeAdd);
    if (saved == null) return;
    qs("#payCalc .tableContainer").innerHTML = saved;
    qs("#payCalcName input").value = localStorage.getItem("payCalcName" + officeAdd);
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function displayStorageTime() {
    let time = new Date(localStorage.getItem("payCalcSaveTime" + officeAdd));
    qi("saveTime").innerHTML =
        new Date().getDate() == time.getDate()
            ? time.toLocaleTimeString([], { hour12: false })
            : time.toLocaleDateString('he-IL');
}
//#endregion

// CALCULATIONS
/** Calculate payment for activity
 Activity has 3 prices based on seniority
 Above times the amount of the activity given that day
 If tagged so add tag value 
*/
function payPerActivity(e, addSup = null) {
    let rowNum = getRowNum(e);
    let activityTypeRow = getValFromList(rowNum, "activityType");
    let seniorityCol = getValFromList(rowNum, "seniority");
    let activityAmount = getValFromList(rowNum, "activityAmount");
    let activityTypeKey = qs(`[data-rownum='${rowNum}'] .activityType input`)
        .value;

    let tag = getTagFromListOption(activityTypeKey, "activityType");
    qs(`[data-rownum='${rowNum}']`).dataset.tag = activityAmount == 1 ? tag : '';

    let isCustomActivity = activityTypeKey == "??????";
    // cl(e.target)
    if (addSup == null && e.target.parentElement.classList.contains("activityType")) {
        qs(
            `[data-rownum='${rowNum}'] .activityPay input`
        ).readOnly = !isCustomActivity;
        qs(
            `[data-rownum='${rowNum}'] .activityPay input`
        ).value = isCustomActivity ? "" : 0;
        if (isCustomActivity) {
            qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
                "placeholder",
                "???? ??????????????"
            );
            qs(`[data-rownum='${rowNum}'] .seniority input`).removeAttribute(
                "list"
            );
            qs(
                `[data-rownum='${rowNum}'] .seniority input`
            ).classList.remove("invalidList");
            qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
            qs(
                `[data-rownum='${rowNum}'] .activityAmount input`
            ).readOnly = true;
            qs(
                `[data-rownum='${rowNum}'] .activityAmount input`
            ).classList.remove("invalidList");
        } else {
            qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
                "placeholder",
                "???? ??????????"
            );
            qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
                "list",
                "seniorityList"
            );
            qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = "";
            qs(
                `[data-rownum='${rowNum}'] .activityAmount input`
            ).readOnly = false;
            qs(
                `[data-rownum='${rowNum}'] .activityPay input`
            ).classList.remove("invalidPattern");
        }
        showErrorMsg();
    }

    if (
        (!activityTypeRow || !seniorityCol || !activityAmount) &&
        !isCustomActivity
    )
        return;
    let singalCost = getValue(
        parseInt(activityTypeRow) - 1,
        parseInt(seniorityCol) + 5
    );
    // console.log(`type ${singalCost}, Vetek ${seniorityCol}, Amount ${activityAmount}`);
    let payVal = parseInt(activityAmount) * singalCost;
    if (addSup)
        payVal += parseInt(getCol(constNameCol, constValCol).find((x) => x.key == tag).val);

    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = payVal;

    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (qi("totalPay"))//not in office
        qi("totalPay").innerText = sumCells(".midSum");
}

/**
 * Check if any row tagged with {?????????? ??????????} needs to get supplement or remove supplement if more then 1 activity at same place and day
 */
function handelSingalActivitySup() {
    let groupedRows = [];
    [...qsa('#payCalc [data-rownum]')].forEach((row) => {
        let added = false;
        groupedRows.forEach((rowGroup) => {
            if (rowGroup[0].dataset.spacetime == row.dataset.spacetime) {
                added = true;
                rowGroup.push(row);
            }
        });
        if (!added)
            groupedRows.push([row]);
    });

    groupedRows.forEach((rowGroup) => {
        if (rowGroup.length == 1 && rowGroup[0].dataset.tag == "{?????????? ??????????}")
            payPerActivity(rowGroup[0], true);
        else {
            rowGroup.forEach((row) => {
                if (row.dataset.tag == "{?????????? ??????????}")
                    payPerActivity(row, false);
            });
        }
    });
}

function getRowNum(e) {
    let el = e.target ?? e;
    return el.closest("tr").dataset.rownum;
}

function sumCells(selector) {
    return Array.from(qsa(selector)).reduce(
        (sum, el) => sum + parseInt(el.value ? el.value : el.innerText),
        0
    );
}
function getListInputDataVal(selector) {
    let inputElement = qs(selector);
    let option = Array.from(inputElement.list.querySelectorAll("option")).find(
        (x) => x.innerText == inputElement.value
    );
    if (option == null) return null;
    return option.dataset.val;
}
// EVENTS
function addEventListeners() {
    qsa("input").forEach(function (e) {
        e.addEventListener("change", () => setTimeout(saveToStorage, 1000));
    });
    qi("clearStorageBtn").addEventListener("click", clearStorage);
    qi("saveI").addEventListener("mouseenter", () => qi("saveExplain").show());
    qi("saveI").addEventListener("mouseleave", () =>
        qi("saveExplain").close()
    );
    qs("#addRow").addEventListener("click", addRow);
    qsa(".removeRow").forEach(function (e) {
        e.addEventListener("click", removeRow);
    });
    qs("#send").addEventListener("click", send);
    qsa(".activity input").forEach(function (e) {
        e.addEventListener("change", payPerActivity);
    });
    qsa(".distance input").forEach(function (e) {
        e.addEventListener("keyup", payPerKm);
    });
    qsa("tbody [type=checkbox]").forEach(function (e) {
        e.addEventListener("change", payPerKm);
    });
    qsa("#payCalc .activityPay").forEach(function (e) {
        e.addEventListener("keyup", function () {
            qi("totalActivityPay").innerText = sumCells(
                ".activityPay input"
            );
            if (qi("totalPay"))//not for office
                qi("totalPay").innerText = sumCells(".midSum");
        });
    });
    qsa("[list]").forEach((e) => {
        e.addEventListener("change", isFromList);
    });
    qsa("#payCalc [type='date']").forEach((e) => {
        e.addEventListener("change", checkDate);
    });
    qsa("#payCalc .spacetime input").forEach((e) => {
        e.addEventListener("change", (el) => {
            let rowNum = getRowNum(el.target);
            let spacetime = [...qsa(`[data-rownum='${rowNum}'] .spacetime input`)].map((x) => x.value).join();
            qs(`[data-rownum='${rowNum}']`).dataset.spacetime = spacetime;
        });
    });
    // next 2 must be bound after similer selector events so happends after
    qsa(".spacetime input").forEach(function (e) {
        e.addEventListener("change", handelSingalActivitySup);
    }); qsa(".activity input").forEach(function (e) {
        e.addEventListener("change", handelSingalActivitySup);
    });
    if (qs("#receipt"))//not for office
        qs("#receipt").addEventListener("change", isReceiptAttached);
    qsa("[pattern]").forEach((e) => {
        e.addEventListener("change", isPatternMatch);
    });
    qsa("#payCalc .notEmpty input").forEach((e) => {
        e.addEventListener("change", isTextNotEmpty);
    });
    if (qs("#receipt"))//not for office
        qi("receipt").addEventListener("change", (e) => {
            qi("receiptNotice").classList.remove("hide");
        });
}

//#region VALIDATIONS
function isFromList(e) {
    isFromListCheck(e.target);
}
//returns false if invalid
function isFromListCheck(el) {
    if (!el.list) return true;
    let option = Array.from(el.list.querySelectorAll("option")).find(
        (x) => x.innerText == el.value
    );
    if (option != null) el.classList.remove("invalidList");
    else el.classList.add("invalidList");
    showErrorMsg();
    return !el.classList.contains("invalidList");
}
function isListNotEmpty() {
    qsa("#payCalc [list]").forEach((el) => {
        if (el.value && isFromListCheck(el)) {
            el.classList.remove("invalidList");
        } else {
            el.classList.add("invalidList");
        }
    });
}
function checkDate() {
    qsa("#payCalc [type='date']").forEach((el) => {
        if (el.value != "") {
            el.classList.remove("invalidDate");
        } else {
            el.classList.add("invalidDate");
        }
    });
    showErrorMsg();
}

function isAlreadySent() {
    if (qi("send").innerText == "????????")
        return !confirm("?????????? ?????? ???????? ?????????? ??????????.\n ?????? ?????? ?????????? ???????");
    return false;
}
function isPatternMatch() {
    qsa("#payCalc [pattern]").forEach((el) => {
        if (el.checkValidity()) {
            el.classList.remove("invalidPattern");
        } else {
            el.classList.add("invalidPattern");
        }
    });
    showErrorMsg();
}
function isTextNotEmpty(event) {
    let els = event ? [event.target] : qsa("#payCalc .notEmpty input");
    els.forEach((el) => {
        if (el.value) {
            el.classList.remove("invalidEmpty");
        } else {
            el.classList.add("invalidEmpty");
        }
    });
    showErrorMsg();
}

function addStyle(clone, selector, styleName, style) {
    clone.querySelectorAll(selector).forEach((e) => {
        e.style[styleName] = style;
    });
}

async function postData(formData, webhook) {
    const response = await fetch(webhook, {
        method: "POST",
        cache: "no-store",
        body: formData
    });
    qi("loading").classList.add("hide");
    if (response.ok) {
        qi("send").innerText = "????????";
        let text = await response.text(); //.json()
        console.log(text);
        alert(
            "???????? ????????????!\n???????? ?????????? ?????????? " +
            getListInputDataVal("#payCalcName input")
        );
        clearStorage(false);
    } else {
        qi("send").innerText = "??????????";
        let json = await response.json();
        console.log(json);
        alert("???? ???????????? ?????????? - ???? ?????????? ??????.\n??????????:\n" + json.message);
    }
}

// SELECTORS
function qs(s) {
    return document.querySelector(s);
}
function qsa(s) {
    return document.querySelectorAll(s);
}
function qi(s) {
    return document.getElementById(s);
}
function qc(s) {
    return document.getElementsByClassName(s)[0];
}
function qca(s) {
    return document.getElementsByClassName(s);
}
function qp(p, n) {
    return document.querySelector(`[${p}="${n}"]`);
}
function cl(txt) {
    console.log(txt);
}
