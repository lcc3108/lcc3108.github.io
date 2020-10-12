$(document).ready(function() {
  window.onresize = function() {
    onScroll(document.getElementById("post-listing").scrollTop, document.getElementById("post-listing").scrollHeight);
  };

  window.onscroll = function() {
    onScroll(
      document.body.scrollTop || document.documentElement.scrollTop || window.pageYOffset,
      document.getElementById("post-listing").scrollHeight + sticky
    );
  };

  document.getElementById("post-listing").onscroll = function() {
    onScroll(document.getElementById("post-listing").scrollTop, document.getElementById("post-listing").scrollHeight);
  };

  var header = document.getElementById("progress-container");
  // var sticky = header.offsetTop;
  var sticky = 400;

  function onScroll(scroll, heigth) {
    // var winScroll = document.body.scrollTop || document.documentElement.scrollTop || window.pageYOffset;
    var winScroll = scroll;
    // var windowHeight = document.getElementById("post-listing").scrollHeight + sticky;
    var windowHeight = heigth;
    var height = windowHeight - document.documentElement.clientHeight;

    var scrolled = (winScroll / height) * 100;
    document.getElementById("page-status").style.width = scrolled + "%";

    if (winScroll > sticky) {
      header.classList.add("sticky");
    } else {
      header.classList.remove("sticky");
    }

    $("#scroll-button")
      .removeClass("scroll-position-top")
      .removeClass("scroll-position-bottom");

    if (scrolled < 5) $("#scroll-button").addClass("scroll-position-top");
    else if (scrolled > 95) $("#scroll-button").addClass("scroll-position-bottom");
  }

  $("#to-top").click(function() {
    $(".post-listing").animate({ scrollTop: 0 }, "slow");
    $("html, body").animate({ scrollTop: 0 }, "slow");
  });
  $("#to-bottom").click(function() {
    $(".post-listing").animate({ scrollTop: document.getElementById("post-listing").scrollHeight + sticky }, "slow");
    $("html, body").animate({ scrollTop: document.getElementById("post-listing").scrollHeight + sticky }, "slow");
  });

  // If the link exists in an external site, add the target _blank attribute.
  $(document.links)
    .filter(function() {
      return this.hostname != window.location.hostname;
    })
    .attr("target", "_blank");
});
