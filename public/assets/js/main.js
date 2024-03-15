var attachments;
let jsonData = [
  { email: "", name: "", phone: "", address: "" },
  { email: "", name: "", phone: "", address: "" },
  { email: "", name: "", phone: "", address: "" },
  { email: "", name: "", phone: "", address: "" },
];
async function sendEmail(event) {
  event.preventDefault();
  Swal.showLoading();
  const to = document.getElementById("to").value;
  const subject = document.getElementById("subject").value;
  const message = document.getElementById("message").value;

  if (!to || !subject || !message) {
    alert("To, Subject, and Message are required fields.");
    return;
  }

  // Create FormData object to handle file uploads

  // Use the Fetch API to send the data to a server endpoint
  fetch("/api/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      subject,
      message: message,
    }),
  })
    .then((response) => {
      Swal.hideLoading();
      if (!response.ok) {
        throw response;
      }
      return response.json();
    })
    .then(handleResponse)
    .catch((error) => {
      error.json().then(showErrorMessage);
    });
  // Handle other types of errors
}
// Display the resulting HTML table

function jsonToHtmlTable(jsonData) {
  // Validate input
  if (!jsonData || typeof jsonData !== "object") {
    console.error("Invalid JSON data");
    return "";
  }

  // Extract keys from the first object in the array (assuming it's an array of objects)
  const keys = Object.keys(jsonData[0]);

  // Generate the HTML table
  let tableHtml = '<table border="1"><thead><tr>';

  // Add table headers
  keys.forEach((key, keysIndex) => {
    tableHtml += `<th>${key}</th>`;
  });

  tableHtml += "</tr></thead><tbody>";

  // Add table rows
  jsonData.forEach((item, itemIndex) => {
    tableHtml += "<tr>";
    keys.forEach((key, ind) => {
      tableHtml += `<td contenteditable="true" data-row="${itemIndex}" data-key="${key}">${item[key]}</td>`;
    });
    tableHtml += "</tr>";
  });

  tableHtml += "</tbody></table>";

  return tableHtml;
}

document
  .querySelector(".table_container")
  .addEventListener("input", async function (e) {
    const target = e.target;
    if (target.tagName === "TD" && target.hasAttribute("contenteditable")) {
      const row = target.getAttribute("data-row");
      const key = target.getAttribute("data-key");
      const newValue = target.innerText;

      // Update jsonData array with the new value
      jsonData[row][key] = await newValue;
    }

    let filteredData = await jsonData.filter((data) => {
      let pattern = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
      return pattern.test(data?.email);
    });

    document.querySelector("#to").value = await JSON.stringify(filteredData);

    document.querySelector("#count").textContent =
      filteredData.length + " emails";

    if (filteredData.length > 0) {
      document
        .querySelector("form > button[type=submit]")
        .attributes.removeNamedItem("disabled");
    }
  });

// Assume you have an input file element with id="fileInput"
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];

  if (file) {
    const reader = new FileReader();

    reader.onload = async (event) => {
      const data = event.target.result;
      const workbook = XLSX.read(data, { type: "binary" });

      // Access the data from the workbook
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const tableData = await XLSX.utils.sheet_to_json(worksheet, {
        headers: 1,
      });
      // .filter((data) => {
      //   let pattern = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
      //   return data[Object.keys(data)][0];

      //   return pattern.test(
      //     data?.email || data.Email || data[Object.keys(data)][0]
      //   );
      // });

      if (tableData.length > 0) {
        document.querySelector("#count").textContent =
          tableData.length + " emails";
        jsonData = await XLSX.utils.sheet_to_json(worksheet);
        // .filter((data) => {
        //   let pattern = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
        //   return data[Object.keys(data)][0];
        //   // return pattern.test(
        //   //   data?.email || data.Email || data[Object.keys(data)][0]
        //   // );
        // });

        for (let i of document.querySelectorAll(".variableHelper")) {
          i.innerHTML = "";
        }

        Object.keys(jsonData[0]).forEach(function (key) {
          html = `<option value="@(${key})">${key}</option>`;
          for (let i of document.querySelectorAll(".variableHelper")) {
            i.innerHTML += html;
          }
        });
        document.querySelector("#to").value = await JSON.stringify(jsonData);
        document
          .querySelector("form > button[type=submit]")
          .attributes.removeNamedItem("disabled");
        document.querySelector(".table_container").innerHTML =
          jsonToHtmlTable(tableData);
      }
    };

    reader.readAsBinaryString(file);
  }
});

const attachmentsInput = document.querySelector("#attachments");
attachmentsInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async function (event) {
      attachments = {
        data: event.target.result,
        filename: file.name, // Include the original file name
      };
    };
    reader.onerror = (error) => console.error(error);
    reader.readAsDataURL(file);
  }
});

function addVariable(event) {
  if (event.target.id == "subjectVariable") {
    document.querySelector("#subject").value += event.target.value;
  } else {
    // Assuming the rich text editor has an ID of #message
    let currentContent = $("#message").val();
    $("#message").val(currentContent + `<p>${event.target.value}</p>`);

    // Trigger the change event to update the rich text editor
    $("#message").trigger("change");
  }

  // Clear the input field
  event.target.value = "";
}

/*** Don't change */

window.onload = async function () {
  document.querySelector(".table_container").innerHTML =
    jsonToHtmlTable(jsonData);

  for (let i of document.querySelectorAll(".variableHelper")) {
    i.innerHTML = "";
  }

  Object.keys(jsonData[0]).forEach(function (key) {
    html = `<option value="@(${key})">${key}</option>`;
    for (let i of document.querySelectorAll(".variableHelper")) {
      i.innerHTML += html;
    }
  });
};

$("#message").richText({
  // text formatting
  bold: true,
  italic: true,
  underline: true,

  // text alignment
  leftAlign: true,
  centerAlign: true,
  rightAlign: true,
  justify: true,

  // lists
  ol: true,
  ul: true,

  // title
  heading: true,

  // fonts
  fonts: true,
  fontList: [
    "Arial",
    "Arial Black",
    "Comic Sans MS",
    "Courier New",
    "Geneva",
    "Georgia",
    "Helvetica",
    "Impact",
    "Lucida Console",
    "Tahoma",
    "Times New Roman",
    "Verdana",
  ],
  fontColor: true,
  backgroundColor: true,
  fontSize: true,

  // uploads
  imageUpload: true,

  // link
  urls: true,

  // tables
  table: true,

  // code
  removeStyles: true,
  code: true,

  // colors
  colors: [],

  // dropdowns
  fileHTML: "",
  imageHTML: "",

  // translations
  translations: {
    title: "Title",
    white: "White",
    black: "Black",
    brown: "Brown",
    beige: "Beige",
    darkBlue: "Dark Blue",
    blue: "Blue",
    lightBlue: "Light Blue",
    darkRed: "Dark Red",
    red: "Red",
    darkGreen: "Dark Green",
    green: "Green",
    purple: "Purple",
    darkTurquois: "Dark Turquois",
    turquois: "Turquois",
    darkOrange: "Dark Orange",
    orange: "Orange",
    yellow: "Yellow",
    imageURL: "Image URL",
    fileURL: "File URL",
    linkText: "Link text",
    url: "URL",
    size: "Size",
    responsive:
      '<a href="https://www.jqueryscript.net/tags.php?/Responsive/">Responsive</a>',
    text: "Text",
    openIn: "Open in",
    sameTab: "Same tab",
    newTab: "New tab",
    align: "Align",
    left: "Left",
    justify: "Justify",
    center: "Center",
    right: "Right",
    rows: "Rows",
    columns: "Columns",
    add: "Add",
    pleaseEnterURL: "Please enter an URL",
    videoURLnotSupported: "Video URL not supported",
    pleaseSelectImage: "Please select an image",
    pleaseSelectFile: "Please select a file",
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    alignLeft: "Align left",
    alignCenter: "Align centered",
    alignRight: "Align right",
    addOrderedList: "Ordered list",
    addUnorderedList: "Unordered list",
    addHeading: "Heading/title",
    addFont: "Font",
    addFontColor: "Font color",
    addBackgroundColor: "Background color",
    addFontSize: "Font size",
    addImage: "Add image",
    addVideo: "Add video",
    addFile: "Add file",
    addURL: "Add URL",
    addTable: "Add table",
    removeStyles: "Remove styles",
    code: "Show HTML code",
    undo: "Undo",
    redo: "Redo",
    save: "Save",
    close: "Close",
  },

  // privacy
  youtubeCookies: false,

  // preview
  preview: false,

  // placeholder
  placeholder: "",

  // dev settings
  useSingleQuotes: false,
  height: 0,
  heightPercentage: 0,
  adaptiveHeight: false,
  id: "",
  class: "",
  useParagraph: false,
  maxlength: 0,
  maxlengthIncludeHTML: false,
  callback: undefined,
  useTabForNext: false,
  save: false,
  saveCallback: undefined,
  saveOnBlur: 0,
  undoRedo: true,
});

function showSuccessMessage(message) {
  Swal.fire({
    icon: "success",
    title: "Success!",
    text: message,
  });
}

function showErrorMessage(json) {
  Swal.fire({
    icon: "error",
    title: "Error!",
    text: json["error"],
  });
}

function handleResponse(response) {
  showSuccessMessage(response.message); // Adjust based on your API response structure
}
